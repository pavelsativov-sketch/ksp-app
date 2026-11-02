import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { reserveQuotaOrResponse } from "@/lib/billing/quota";
import { getAccessiblePlan } from "@/lib/plans-repo";
import { generateTeacherSpeech } from "@/lib/materials/generate";
import { buildSpeechDocx } from "@/lib/materials/speech-docx";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({ planId: z.string().regex(/^[0-9a-f]{24}$/i) });

/** Слова педагога: ИИ пишет живую речь учителя по плану, ответ — структура и готовый Word. */
export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const rl = await checkRateLimitAsync(`ai:${auth.user.id}`, 30, 3600_000);
  if (!rl.ok) return NextResponse.json({ error: "Превышен лимит запросов. Попробуйте позже." }, { status: 429 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Нужен planId" }, { status: 400 });

  const plan = await getAccessiblePlan(parsed.data.planId, auth.user.id);
  if (!plan) return NextResponse.json({ error: "План не найден" }, { status: 404 });

  const quota = await reserveQuotaOrResponse(auth.user, "generation");
  if (!quota.ok) return quota.response;

  try {
    const speech = await generateTeacherSpeech(plan);
    const docx = await buildSpeechDocx(plan.title, plan.content.topic, speech);
    await quota.reservation.finalize(true);
    return NextResponse.json(
      { speech, docxBase64: docx.toString("base64"), fileName: `Слова педагога - ${plan.title || "КСП"}.docx` },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    await quota.reservation.finalize(false).catch(() => undefined);
    console.error("Teacher speech generation failed", error);
    return NextResponse.json({ error: "Не удалось составить слова педагога. Повторите попытку позже." }, { status: 503 });
  }
}
