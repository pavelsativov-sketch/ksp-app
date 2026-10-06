import type { Flashcard, WorksheetTask } from "./types";
import { generateImage } from "@/lib/ai/image";

/**
 * Иллюстрации раздаточных материалов — единый провайдер Cloudflare FLUX.1
 * (тот же, что для картинок к уроку и карточек рабочего листа).
 *
 * Генерация параллельная с ограничением одновременных запросов, чтобы не упереться
 * в rate-limit. Отдельная неудача не срывает набор — элемент остаётся без картинки.
 * Итог возвращается с числом попыток и успехов, чтобы вызывающий код мог
 * показать пользователю честную пометку вместо молчаливого отсутствия рисунков.
 *
 * `reserve` обязателен: каждый вызов Cloudflare AI стоит денег, поэтому слот
 * тарифа резервируется ДО запроса к провайдеру. Без него слот можно было бы
 * обойти, просто вызвав /api/handouts/* с withImages.
 */

export interface IllustrationResult<T> {
  items: T[];
  /** Сколько иллюстраций пытались создать (0 — провайдер не настроен). */
  attempted: number;
  /** Сколько иллюстраций реально получено. */
  created: number;
  /** Квота изображений исчерпана — дальше генерация не идёт. */
  quotaExhausted: boolean;
}

/**
 * Резервирует слот квоты изображений. Возвращает false, когда квота исчерпана
 * (тогда вызывающий обязан остановить генерацию).
 */
export type ReserveImageSlot = () => Promise<{
  ok: boolean;
  finalize?: (success: boolean) => Promise<void>;
}>;

export async function illustrateFlashcards(
  cards: Flashcard[],
  ctx: { topic: string; subject: string; grade: number; language: "ru" | "kz" },
  reserve: ReserveImageSlot,
): Promise<IllustrationResult<Flashcard>> {
  return illustrate(cards, ctx, (card) => buildFlashcardPrompt(card, ctx), (card, result) => ({
    ...card,
    imageBase64: result.base64,
    imageMime: result.mimeType === "image/png" ? "image/png" as const : "image/jpeg",
    imageAlt: card.front,
  }), reserve);
}

export async function illustrateWorksheetTasks(
  tasks: WorksheetTask[],
  ctx: { topic: string; subject: string; grade: number },
  reserve: ReserveImageSlot,
): Promise<IllustrationResult<WorksheetTask>> {
  // Generate images for tasks where the AI provided an English image prompt
  const tasksToIllustrate = tasks.filter(t => Boolean(t.imagePromptEn));
  
  const result = await illustrate(tasksToIllustrate, ctx, (task) => buildWorksheetPrompt(task, ctx), (task, res) => ({
    ...task,
    imageBase64: res.base64,
    imageMime: "image/jpeg" as const,
    imageAlt: task.prompt.slice(0, 120),
  }), reserve);

  // Merge back illustrated tasks with non-illustrated ones
  let createdCount = 0;
  const finalTasks = tasks.map(t => {
    const illustrated = result.items.find(it => it.prompt === t.prompt && it.type === t.type);
    if (illustrated?.imageBase64) createdCount++;
    return illustrated || t;
  });

  return {
    items: finalTasks,
    // attempted — реальные попытки у провайдера, а не число заданий:
    // без ключей Cloudflare и при исчерпанной квоте это 0.
    attempted: result.attempted,
    created: createdCount,
    quotaExhausted: result.quotaExhausted,
  };
}

async function illustrate<T>(
  items: T[],
  ctx: { topic: string; subject: string; grade: number },
  promptOf: (item: T) => string,
  withImage: (item: T, result: { base64: string; mimeType: string }) => T,
  reserve: ReserveImageSlot,
): Promise<IllustrationResult<T>> {
  if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) {
    return { items, attempted: 0, created: 0, quotaExhausted: false };
  }

  const out: T[] = new Array(items.length);
  let created = 0;
  let quotaExhausted = false;
  let attempted = 0;

  // Лимит параллельности, чтобы не словить 429 от провайдера.
  const CONCURRENCY = 3;
  let cursor = 0;
  // Резервирование квоты обязано быть ПОСЛЕДОВАТЕЛЬНЫМ: параллельные воркеры
  // иначе одновременно увидели бы «слот ещё есть» и выдали лишние картинки.
  let reserveChain: Promise<void> = Promise.resolve();
  async function takeSlot() {
    let result: Awaited<ReturnType<ReserveImageSlot>> = { ok: false };
    const run = reserveChain.then(async () => {
      result = await reserve().catch(() => ({ ok: false as const }));
      if (!result.ok) quotaExhausted = true;
    });
    reserveChain = run.catch(() => {});
    await run;
    return result;
  }
  async function worker() {
    while (cursor < items.length) {
      if (quotaExhausted) return;
      const i = cursor++;
      const item = items[i];
      // Слот квоты — ДО обращения к провайдеру: иначе расход идёт мимо тарифа.
      const slot = await takeSlot();
      if (!slot.ok) return;
      attempted++;
      try {
        const result = await generateImage({
          prompt: promptOf(item),
          topic: ctx.topic,
          subject: ctx.subject,
          grade: ctx.grade,
        });
        out[i] = withImage(item, result);
        created++;
        await slot.finalize?.(true);
      } catch (error) {
        // Провайдер не ответил — слот возвращаем, чтобы не списать впустую.
        await slot.finalize?.(false).catch(() => {});
        const message = error instanceof Error ? error.message : "Unknown error";
        const status = message.match(/Cloudflare API error \d{3}/)?.[0];
        console.warn(`[Handout image] item ${i + 1}: ${status ?? (error instanceof Error ? error.name : "Error")}`);
        out[i] = item;
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Незаполненные элементы (квота кончилась) возвращаем как есть.
  for (let i = 0; i < items.length; i++) if (out[i] === undefined) out[i] = items[i];

  return { items: out, attempted, created, quotaExhausted };
}

function buildFlashcardPrompt(
  card: Flashcard,
  ctx: { topic: string; subject: string; grade: number },
): string {
  const concept = card.front.replace(/[«»"`]/g, "").slice(0, 80);
  return [
    `Educational flashcard illustration for ${ctx.subject}, grade ${ctx.grade}, topic "${ctx.topic}".`,
    `Concept: "${concept}".`,
    "Square 1:1 composition for a premium school flashcard, one clear visual story with a single focal object and meaningful supporting details.",
    "Friendly modern educational illustration, crisp vector and soft 3D paper-cut style, rich blue, turquoise, yellow and coral accents.",
    "High contrast, clean outline, generous breathing room around the subject, suitable for a child-friendly printed workbook.",
    "No text, no letters, no numbers, no watermarks, no photorealism, no border or frame.",
  ].join(" ");
}

function buildWorksheetPrompt(task: WorksheetTask, ctx: { topic: string; subject: string; grade: number }): string {
  const baseStyle = "High quality 3D rendering in Pixar Disney style, Unreal Engine 5, volumetric lighting, rich vibrant colors. Beautiful, cute and appealing illustration for children's educational workbook. 8k resolution.";
  
  if (task.imagePromptEn) {
    return [
      `Educational worksheet illustration for ${ctx.subject}, grade ${ctx.grade}, topic "${ctx.topic}".`,
      `Scene description: ${task.imagePromptEn}`,
      baseStyle,
      "White background, no watermark, absolutely NO text or words in the image.",
    ].join("\n");
  }

  const concept = task.prompt.replace(/_+/g, "…").replace(/[«»"`]/g, "").slice(0, 120);
  
  let typeSpecificInstruction = "Illustration showing the task concept visually, clear and beautiful.";
  if (task.type === "table_fix") {
    typeSpecificInstruction = "Illustration of a situation or process containing a deliberate error for students to identify, engaging scene.";
  } else if (task.type === "scenario_fix") {
    typeSpecificInstruction = "Illustration depicting a specific scenario or story scene, highly engaging.";
  }
  
  return [
    `Educational worksheet illustration for ${ctx.subject}, grade ${ctx.grade}, topic "${ctx.topic}".`,
    `Task context: "${concept}".`,
    typeSpecificInstruction,
    baseStyle,
    "White background, no watermark, absolutely NO text or words in the image.",
  ].join("\n");
}
