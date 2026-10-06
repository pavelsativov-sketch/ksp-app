import { NextResponse } from "next/server";
import { z } from "zod";
import { booleanFlag, optionalBooleanFlag } from "@/lib/validation/boolean-flag";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { generateHandout } from "@/lib/handouts/generate";
import { buildCombinedDocx } from "@/lib/handouts/docx";
import { resolveWatermark } from "@/lib/billing/watermark";
import { handoutQuota, quotaErrorResponse } from "@/lib/ai/quota-bridge";

export const runtime = "nodejs";

/**
 * Объединённый комплект «Рабочий лист + Памятки»: оба материала
 * генерируются параллельно и упаковываются в один .docx
 * (памятки начинаются с новой страницы).
 */
const bodySchema = z.object({
  topic: z.string().trim().min(1).max(2_000),
  subject: z.string().trim().min(1).max(200),
  grade: z.coerce.number().int().min(1).max(11),
  language: z.enum(["ru", "kz"]).default("ru"),
  worksheetCount: z.coerce.number().int().min(3).max(10).default(6),
  memosCount: z.coerce.number().int().min(3).max(30).default(12),
  withImages: optionalBooleanFlag,
  kspContext: z.object({
    learningObjectives: z.array(z.string()).default([]),
    assessmentCriteria: z.array(z.string()).default([]),
    stages: z.array(z.object({ stage: z.string(), activities: z.string() })).default([]),
  }).optional(),
});

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

  // Общий контекст квоты: комплект — это две генерации, слоты резервируются
  // раздельно внутри generateHandout.
  const quota = handoutQuota(auth.user.id);
  try {
    const { topic, subject, grade, language, worksheetCount, memosCount, withImages, kspContext } = parsed.data;
    const [worksheet, memos] = await Promise.all([
      generateHandout({ kind: "worksheet", topic, subject, grade, language, count: worksheetCount, withImages, kspContext, quota }),
      generateHandout({ kind: "flashcards", topic, subject, grade, language, count: memosCount, withImages, quota }),
    ]);
    if (worksheet.kind !== "worksheet" || memos.kind !== "flashcards") {
      throw new Error("Unexpected handout kinds");
    }
    const watermark = await resolveWatermark(auth.user);
    const buffer = await buildCombinedDocx([worksheet, memos], { watermark });
    return NextResponse.json(
      { worksheet, memos, docxBase64: buffer.toString("base64") },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const quotaResponse = quotaErrorResponse(error);
    if (quotaResponse) return quotaResponse;
    console.error("Combined handout generation failed", error);
    return NextResponse.json({ error: "Не удалось создать комплект. Повторите попытку позже." }, { status: 500 });
  }
}
