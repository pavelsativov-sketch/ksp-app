import { z } from "zod";
import { executeWithFallback } from "@/lib/ai/providers";
import { extractJson } from "@/lib/ai/extract-json";
import { HandoutQuotaError } from "@/lib/billing/quota-error";

/**
 * Карточки групповой и парной работы по образцу владельца (5 класс, урок 2):
 * у каждой группы своя ситуация на тему урока с конкретными фактами, пять заданий
 * по тексту, схема для заполнения, ценность урока, стикер-мотиватор и слоган.
 */
export type GroupMode = "group" | "pair";

export interface GroupTask {
  text: string;
  /** Схема-цепочка для заполнения, например «Источник → Канал связи → Приёмник». */
  schema?: string[];
}

export interface GroupCard {
  title: string;
  situation: string[];
  tasks: GroupTask[];
  value: string;
  note: string;
  slogan: string;
  /** Описание иллюстрации для генератора картинок (без текста на картинке). */
  imagePrompt: string;
  imageBase64?: string;
  imageMime?: "image/jpeg" | "image/png";
}

export interface GroupWork {
  kind: "group";
  mode: GroupMode;
  language: "ru" | "kz";
  topic: string;
  cards: GroupCard[];
}

export interface GroupWorkInput {
  topic: string;
  subject: string;
  grade: number;
  language: "ru" | "kz";
  mode: GroupMode;
  count: number;
  learningObjectives?: string[];
  values?: string;
  quota?: { reserve(kind: "assist"): Promise<{ ok: boolean; finalize?(success: boolean): Promise<void> }> };
}

/** Время одного провайдера: ответ длинный, но Mercury пишет его за секунды. */
const GROUP_TIMEOUT_MS = 45_000;

const short = (max: number) => z.string().trim().min(2).max(max);
const cardSchema = z.object({
  title: short(90),
  situation: z.array(short(600)).min(2).max(7),
  tasks: z.array(z.object({ text: short(320), schema: z.array(short(40)).min(2).max(4).optional().nullable() })).min(4).max(6),
  // Второстепенные поля модель иногда пропускает: из-за них не теряем весь набор карточек.
  value: z.string().trim().max(200).optional().default(""),
  note: z.string().trim().max(120).optional().default(""),
  slogan: z.string().trim().max(90).optional().default(""),
  imagePrompt: z.string().trim().max(600).optional().default(""),
});
const responseSchema = z.object({ cards: z.array(cardSchema).min(1) });

function buildPrompt(input: GroupWorkInput): string {
  const who = input.mode === "pair" ? "пары учеников" : "группы";
  const lang = input.language === "kz" ? "на казахском языке" : "на русском языке";
  return [
    `Составь ${input.count} карточки для работы ${who} на уроке. Предмет: ${input.subject}, ${input.grade} класс, тема: «${input.topic}». Весь текст ${lang}.`,
    input.learningObjectives?.length ? `Цели обучения: ${input.learningObjectives.join("; ")}.` : "",
    input.values ? `Ценность урока (программа «Адал азамат»): ${input.values}` : "Ценность урока выбери из программы «Адал азамат» (трудолюбие и профессионализм, ответственность, закон и порядок, единство и солидарность, созидание и новаторство).",
    "У каждой карточки своя жизненная ситуация из жизни казахстанских школьников (имена Али, Данияр, Айгерим, Аружан и т. п.) с конкретными фактами: числа, действия, результат. 4–6 коротких абзацев, по силам ученикам этого класса.",
    "Пять заданий по тексту ситуации, от простого к сложному: найти в тексте, привести примеры, объяснить, заполнить схему (в одном задании поле schema — 3 звена цепочки по теме), связать с ценностью урока. Задания проверяют цели обучения, ответы есть в тексте.",
    "title — короткий тезис ситуации (до 6 слов); value — мысль о ценности одной фразой; note — короткий мотиватор для стикера; slogan — короткий слоган; imagePrompt — описание иллюстрации к ситуации на английском, без надписей.",
    "Текст ситуации не подсказывает ответы: не называй в нём понятия темы (не пиши «это текстовая информация», «это процесс передачи»), ученики определяют их сами по описанным действиям.",
    "Схема — из учебника по этой теме, звенья короткие (1–3 слова).",
    "Ситуации у карточек разные, факты правдивые, без выдуманных научных терминов.",
    'Ответ строго JSON: {"cards":[{"title":"","situation":[""],"tasks":[{"text":"","schema":null}],"value":"","note":"","slogan":"","imagePrompt":""}]}',
  ].filter(Boolean).join("\n");
}

/** Схема рисуется плашками, поэтому строку пропусков «____ → ____ → ____» в тексте задания убираем. */
export function withoutBlankChain(text: string): string {
  return text.replace(/_{3,}(?:\s*(?:→|->|—|-)\s*_{3,})*/g, "").replace(/\s+([.:;,])/g, "$1").replace(/[:\s]+$/, ".").trim();
}

/** Разбор ответа модели: битая структура срывает попытку провайдера и запускает следующего. */
export function parseGroupWork(raw: string, input: Pick<GroupWorkInput, "count" | "mode" | "language" | "topic">): GroupWork {
  const parsed = responseSchema.parse(extractJson(raw));
  const cards = parsed.cards.slice(0, input.count).map((card) => ({
    ...card,
    tasks: card.tasks.slice(0, 5).map((task) => (task.schema ? { text: withoutBlankChain(task.text), schema: task.schema } : { text: task.text })),
  }));
  if (cards.length < input.count) throw new Error(`Модель вернула ${cards.length} карточек из ${input.count}`);
  return { kind: "group", mode: input.mode, language: input.language, topic: input.topic, cards };
}

export async function generateGroupWork(input: GroupWorkInput): Promise<GroupWork> {
  const slot = input.quota ? await input.quota.reserve("assist") : { ok: true as const };
  if (!slot.ok) throw new HandoutQuotaError();
  try {
    // Цепочка КСП, а не агента: после Mercury там быстрый Groq. На прогоне в проде Mercury
    // вернул пустой ответ, и цепочка агента отдала карточки медленному MXR (70 с).
    const work = await executeWithFallback("generation", async (client, model, config) => {
      const response = await client.chat.completions.create({
        model,
        temperature: 0.6,
        max_completion_tokens: config.maxTokens ?? 8192,
        messages: [
          { role: "system", content: "Ты методист казахстанской школы. Отвечаешь только JSON без пояснений." },
          { role: "user", content: buildPrompt(input) },
        ],
      });
      return parseGroupWork(response.choices[0]?.message.content ?? "", input);
    }, { timeoutMs: GROUP_TIMEOUT_MS });
    await slot.finalize?.(true);
    return work;
  } catch (error) {
    // Слот за неудачную генерацию не списываем.
    await slot.finalize?.(false).catch(() => {});
    throw error;
  }
}
