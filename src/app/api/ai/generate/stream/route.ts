import { z } from "zod";
import { optionalBooleanFlag } from "@/lib/validation/boolean-flag";
import { generateKsp, type KspStage } from "@/lib/ai/generate";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { reserveQuotaOrResponse } from "@/lib/billing/quota";
import { retrieveTextbookContext } from "@/lib/rag/retrieve";
import { ensureArmanPvTextbookIngested } from "@/lib/rag/armanpv";
import { log } from "@/lib/logger";
import { summarizeRagUse } from "@/lib/rag/metadata";

/**
 * Генерация КСП с живым прогрессом (SSE).
 *
 * Раньше генерация была одним POST без обратной связи: учитель смотрел на
 * оверлей, который рисовал проценты по таймеру и ничего не знал о реальном
 * ходе дела. Здесь этапы приходят из пайплайна, поэтому «40%» означает
 * «ход урока пишется», а не «прошло 40% от таймера».
 *
 * Поток нужен именно здесь: обычный ответ отдаётся целиком и только в конце,
 * а учителю нужно видеть движение с первых секунд.
 */

const bodySchema = z.object({
  grade: z.coerce.number().int().min(1).max(11),
  subject: z.string().trim().min(1).max(200),
  topic: z.string().trim().min(1).max(2_000),
  learningObjectives: z.array(z.string().trim().min(1).max(1_000)).max(30).optional(),
  language: z.enum(["ru", "kz"]).default("ru"),
  schoolProfile: z.enum(["emn", "ogn"]).optional(),
  section: z.string().trim().max(500).optional(),
  previousTopic: z.string().trim().max(500).optional(),
  previousHomework: z.string().trim().max(1_000).optional(),
  textbookId: z.string().regex(/^[0-9a-f]{24}$/i).optional(),
  armanpvId: z.string().trim().max(200).optional(),
  refine: optionalBooleanFlag,
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const rl = await checkRateLimitAsync(`ai:${auth.user.id}`, 30, 3600_000);
  if (!rl.ok) {
    return new Response(
      `data: ${JSON.stringify({ type: "error", error: "Превышен лимит запросов. Попробуйте позже." })}\n\n`,
      { status: 429, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return new Response(
      `data: ${JSON.stringify({ type: "error", error: "Invalid JSON" })}\n\n`,
      { status: 400, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return new Response(
      `data: ${JSON.stringify({
        type: "error",
        error: parsed.error.issues.map((i) => i.message).join(", "),
      })}\n\n`,
      { status: 400, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  const quota = await reserveQuotaOrResponse(auth.user, "generation");
  if (!quota.ok) return quota.response;
  const { reservation } = quota;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      let lastPercent = 0;

      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          closed = true;
        }
      };

      /** Отправляет этап, не позволяя проценту пойти назад или повториться. */
      const stage = (s: KspStage) => {
        const percent = Math.max(lastPercent, Math.min(100, Math.round(s.percent)));
        // Повтор того же процента — это не новый этап, а дубль: generateKsp
        // отмечает завершение, и следом маршрут повторял бы 100% ещё раз.
        if (percent === lastPercent) return;
        lastPercent = percent;
        send({ type: "progress", percent, label: s.label });
      };

      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* поток уже закрыт */
        }
      };

      // Учитель закрыл вкладку или нажал «Отменить» — работа впустую.
      request.signal.addEventListener("abort", () => {
        closed = true;
        void reservation.finalize(false);
      });

      try {
        stage({ percent: 5, label: "Разбираем тему и цели урока" });

        // Учебник — отдельный этап: поиск по базе заметно медленнее генерации,
        // и без своей отметки учитель видел бы «висок» на первых процентах.
        let textbookContext: string | undefined;
        let retrievedContext: Awaited<ReturnType<typeof retrieveTextbookContext>> = null;
        let resolvedTextbookId = parsed.data.textbookId;
        const selectedTextbook = Boolean(parsed.data.textbookId || parsed.data.armanpvId);
        if (!resolvedTextbookId && parsed.data.armanpvId) {
          stage({ percent: 8, label: "Подключаем учебник издательства Арман-ПВ" });
          try {
            const ingested = await ensureArmanPvTextbookIngested({ armanpvId: parsed.data.armanpvId });
            resolvedTextbookId = ingested.textbook.id;
          } catch (e) {
            log.warn("Arman-PV auto-ingest failed", { reason: String(e) });
          }
        }

        if (resolvedTextbookId) {
          stage({ percent: 10, label: "Ищем нужное в учебнике" });
          const query = `${parsed.data.subject}. Тема: ${parsed.data.topic}. ${parsed.data.section ?? ""} Класс ${parsed.data.grade}. ${(
            parsed.data.learningObjectives ?? []
          ).join(" ")}`;
          try {
            retrievedContext = await retrieveTextbookContext({
              textbookId: resolvedTextbookId,
              query,
              k: 6,
              userId: auth.user.id,
            });
            textbookContext = retrievedContext?.promptBlock || undefined;
          } catch (e) {
            log.warn("RAG retrieval failed", { reason: String(e) });
          }
          stage({ percent: 15, label: "Поиск контекста учебника завершён" });
        }

        const ragInfo = summarizeRagUse(selectedTextbook, retrievedContext);

        const content = await generateKsp({ ...parsed.data, textbookContext, onStage: stage });
        await reservation.finalize(true);

        // 100% и результат одним кадром: учитель ждёт именно этого — иначе
        // пришлось бы гадать, готовы данные или ещё едут. Повторно 100% не
        // шлём: generateKsp уже отметил завершение, а дубль выглядел бы как
        // два разных этапа с одинаковым числом.
        stage({ percent: 100, label: "План готов" });
        send({
          type: "done",
          content,
          rag: ragInfo,
          quota: { remaining: reservation.remaining },
        });
      } catch (error) {
        await reservation.finalize(false);
        log.error("KSP generation failed", {
          userId: auth.user.id,
          reason: error instanceof Error ? error.message : String(error),
        });
        send({
          type: "error",
          error:
            "Не удалось сгенерировать КСП. Провайдер ИИ сейчас недоступен — попробуйте через минуту или напишите план вручную: поля формы остаются доступными.",
        });
      } finally {
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
