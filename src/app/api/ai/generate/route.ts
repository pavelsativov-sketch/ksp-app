import { NextResponse } from "next/server";
import { z } from "zod";
import { optionalBooleanFlag } from "@/lib/validation/boolean-flag";
import { generateKsp } from "@/lib/ai/generate";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { reserveQuotaOrResponse } from "@/lib/billing/quota";
import { retrieveTextbookContext } from "@/lib/rag/retrieve";

const bodySchema = z.object({
  grade: z.coerce.number().int().min(1).max(11),
  subject: z.string().trim().min(1).max(200),
  topic: z.string().trim().min(1).max(2_000),
  learningObjectives: z.array(z.string().trim().min(1).max(1_000)).max(30).optional(),
  language: z.enum(["ru", "kz"]).default("ru"),
  schoolProfile: z.enum(["emn", "ogn"]).optional(),
  textbookId: z.string().regex(/^[0-9a-f]{24}$/i).optional(),
  refine: optionalBooleanFlag,
});

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const rl = await checkRateLimitAsync(`ai:${auth.user.id}`, 30, 3600_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Превышен лимит запросов. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  const quota = await reserveQuotaOrResponse(auth.user, "generation");
  if (!quota.ok) return quota.response;
  const { reservation } = quota;

  // RAG: если указан textbookId — получаем релевантный контекст учебника.
  let textbookContext: string | undefined;
  let ragInfo: { textbookTitle: string | null; chunkCount: number; method: string | null; status: string; warnings: string[] } | null = null;
  if (parsed.data.textbookId) {
    ragInfo = {
      textbookTitle: null, chunkCount: 0, method: null, status: "unavailable",
      warnings: ["Контекст учебника недоступен. План создан без опоры на выбранный учебник."],
    };
    const query = `${parsed.data.subject}. Тема: ${parsed.data.topic}. Класс ${parsed.data.grade}. ${
      (parsed.data.learningObjectives ?? []).join(" ")
    }`;
    try {
      const ctx = await retrieveTextbookContext({
        textbookId: parsed.data.textbookId,
        query,
        k: 6,
        userId: auth.user.id,
      });
      if (ctx) {
        textbookContext = ctx.promptBlock || undefined;
        ragInfo = { textbookTitle: ctx.textbookTitle, chunkCount: ctx.chunks.length, method: ctx.method,
          status: ctx.status, warnings: ctx.warnings };
      }
    } catch (e) {
      console.warn("RAG retrieval failed:", e);
    }
  }

  try {
    const content = await generateKsp({ ...parsed.data, textbookContext });
    // Фиксация успеха обязательна: у тарифа с лимитом она ничего не делает,
    // но у Pro именно finalize(true) пишет событие в аналитику. Без этого
    // успешные генерации Pro были не видны в отчётах вообще.
    await reservation.finalize(true);
    return NextResponse.json({ content, rag: ragInfo, quota: { remaining: reservation.remaining } });
  } catch (error) {
    await reservation.finalize(false);
    console.error("KSP generation failed", error);
    return NextResponse.json(
      {
        error: "Не удалось сгенерировать КСП. Провайдер ИИ сейчас недоступен — попробуйте через минуту или напишите план вручную: поля формы остаются доступными.",
      },
      { status: 503 },
    );
  }
}
