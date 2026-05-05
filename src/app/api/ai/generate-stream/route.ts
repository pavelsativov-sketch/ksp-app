/**
 * POST /api/ai/generate-stream — same payload as /api/ai/generate, but the
 * response is a Server-Sent Events stream:
 *
 *   event: progress
 *   data:  {"stage":"connect","message":"..."}
 *
 *   event: progress
 *   data:  {"stage":"generating","message":"..."}
 *
 *   event: done
 *   data:  {"content": <AiKspPayload>}
 *
 *   event: error
 *   data:  {"message":"..."}
 *
 * The actual AI call is the same as /api/ai/generate; we just emit periodic
 * "alive" frames every few seconds so the user sees forward motion while
 * Gemini takes 30–60s on a complex schema. Real wall-clock time is identical;
 * perceived time drops dramatically because the spinner is replaced with a
 * sequence of progress messages.
 *
 * Note: counts against the SAME hourly budget as `ai/generate`. Otherwise a
 * client could just call the streaming variant to bypass the limit.
 */

import { z } from "zod";
import { generateKsp } from "@/lib/ai/generate";
import { guardAiRoute } from "@/lib/server/ai-guard";
import { elapsedMs, logError, logEvent } from "@/lib/server/log";

const bodySchema = z.object({
  grade: z.coerce.number().int().min(1).max(12),
  subject: z.string().trim().min(1),
  topic: z.string().trim().min(1),
  learningObjectives: z.array(z.string()).optional(),
  language: z.enum(["ru", "kz"]).default("ru"),
});

export const runtime = "nodejs";

const PROGRESS_MESSAGES_RU = [
  "Подключаемся к Gemini...",
  "Анализируем тему урока и цели обучения...",
  "Формулируем цели урока (SMART)...",
  "Прорабатываем критерии оценивания...",
  "Составляем этап «Начало урока» (актуализация, кумулятивная беседа)...",
  "Составляем этап «Середина урока» (объяснение, практика, дескрипторы)...",
  "Составляем этап «Конец урока» (итог, рефлексия, домашнее задание)...",
  "Прорабатываем шкалу 10 баллов и общий дескриптор 1–10...",
  "Подбираем языковые цели и привитие ценностей...",
  "Заканчиваем дифференциацию и здоровьесбережение...",
  "Финализируем JSON и проверяем структуру...",
];

const PROGRESS_MESSAGES_KZ = [
  "Gemini-ге қосыламыз...",
  "Сабақ тақырыбын және оқу мақсаттарын талдаймыз...",
  "Сабақ мақсаттарын қалыптастырамыз (SMART)...",
  "Бағалау критерийлерін жасаймыз...",
  "«Сабақ басы» кезеңін жасаймыз (актуализация, кумулятивтік әңгіме)...",
  "«Сабақ ортасы» кезеңін жасаймыз (түсіндіру, тәжірибе, дескрипторлар)...",
  "«Сабақ соңы» кезеңін жасаймыз (қорытынды, рефлексия, үй тапсырмасы)...",
  "10 балдық шкаласы мен 1–10 жалпы дескрипторды дайындаймыз...",
  "Тілдік мақсаттар мен құндылықтарды қосамыз...",
  "Сараланған тапсырмалар мен қауіпсіздік ережелерін аяқтаймыз...",
  "JSON форматын аяқтап, құрылымды тексеріп жатырмыз...",
];

function ssePayload(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const started = Date.now();
  const guard = await guardAiRoute("ai/generate");
  if (!guard.ok) return guard.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: parsed.error.issues.map((i) => i.message).join(", "),
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  const input = parsed.data;
  const messages =
    input.language === "kz" ? PROGRESS_MESSAGES_KZ : PROGRESS_MESSAGES_RU;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let alive = true;
      const send = (event: string, data: unknown) => {
        if (!alive) return;
        try {
          controller.enqueue(encoder.encode(ssePayload(event, data)));
        } catch {
          alive = false;
        }
      };

      send("progress", { stage: "connect", message: messages[0], pct: 5 });

      // Tick through progress messages every ~3 s. Cycles past the end so the
      // user keeps seeing motion if Gemini takes longer than expected.
      let messageIndex = 1;
      const ticker = setInterval(() => {
        const msg = messages[messageIndex % messages.length];
        const pct = Math.min(
          92,
          5 + Math.round((messageIndex / messages.length) * 85),
        );
        send("progress", { stage: "generating", message: msg, pct });
        messageIndex += 1;
      }, 3000);

      try {
        const content = await generateKsp(input);
        clearInterval(ticker);
        send("progress", {
          stage: "validating",
          message:
            input.language === "kz"
              ? "Сұлбаны соңғы рет тексеріп жатырмыз..."
              : "Финальная проверка структуры...",
          pct: 96,
        });
        send("done", { content });
        logEvent("ai.generate-stream.ok", {
          userId: guard.userId,
          durationMs: elapsedMs(started),
          grade: input.grade,
          language: input.language,
        });
      } catch (e) {
        clearInterval(ticker);
        const msg = e instanceof Error ? e.message : "AI error";
        send("error", { message: msg });
        logError("ai.generate-stream.error", {
          userId: guard.userId,
          durationMs: elapsedMs(started),
          errorMessage: msg,
        });
      } finally {
        alive = false;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable Cloudflare/CDN buffering of SSE so progress events arrive
      // in real time instead of being held until the response closes.
      "X-Accel-Buffering": "no",
    },
  });
}
