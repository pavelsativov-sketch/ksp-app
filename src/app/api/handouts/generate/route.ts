import { NextResponse } from "next/server";
import { z } from "zod";
import { booleanFlag, optionalBooleanFlag } from "@/lib/validation/boolean-flag";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { generateHandout } from "@/lib/handouts/generate";
import { buildHandoutDocx } from "@/lib/handouts/docx";
import { resolveWatermark } from "@/lib/billing/watermark";
import { handoutQuota, quotaErrorResponse } from "@/lib/ai/quota-bridge";

export const runtime = "nodejs";

const bodySchema = z.object({
  kind: z.enum(["worksheet", "flashcards", "crossword"]),
  topic: z.string().trim().min(1).max(2_000),
  subject: z.string().trim().min(1).max(200),
  grade: z.coerce.number().int().min(1).max(11),
  language: z.enum(["ru", "kz"]).default("ru"),
  count: z.coerce.number().int().min(3).max(30).default(8),
  withImages: optionalBooleanFlag,
  generateImages: optionalBooleanFlag,
  cardLayout: optionalBooleanFlag,
  customWords: z.array(z.object({
    word: z.string().trim().min(1).max(30),
    clue: z.string().trim().min(1).max(500),
  })).max(15).optional(),
  kspContext: z.object({
    learningObjectives: z.array(z.string()).default([]),
    assessmentCriteria: z.array(z.string()).default([]),
    stages: z.array(z.object({ stage: z.string(), activities: z.string() })).default([]),
  }).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  schoolName: z.string().trim().max(200).optional(),
  teacherName: z.string().trim().max(200).optional(),
  customInstructions: z.string().trim().max(2000).optional(),
}).superRefine((value, ctx) => {
  if (value.kind === "worksheet" && value.count > 10) {
    ctx.addIssue({ code: "custom", path: ["count"], message: "В рабочем листе может быть не более 10 заданий: сумма баллов должна равняться 10." });
  }
  if (value.kind === "crossword" && value.count > 20) {
    ctx.addIssue({ code: "custom", path: ["count"], message: "В кроссворде может быть не более 20 слов." });
  }
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

  // Rate limiting for image generation: separate, stricter limit
  const wantsImages = Boolean(parsed.data.withImages || parsed.data.generateImages);
  if (wantsImages) {
    const imageRl = await checkRateLimitAsync(`image:${auth.user.id}`, 20, 3600_000);
    if (!imageRl.ok) {
      return NextResponse.json(
        { error: "Превышен лимит генерации изображений. Попробуйте позже." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((imageRl.resetAt - Date.now()) / 1000)) } },
      );
    }
  }

  try {
    const handout = await generateHandout({ ...parsed.data, quota: handoutQuota(auth.user.id) });
    const watermark = await resolveWatermark(auth.user);
    const buffer = await buildHandoutDocx(handout, {
      watermark,
      schoolName: parsed.data.schoolName,
      teacherName: parsed.data.teacherName,
      showPageNumbers: true,
      showHeader: true,
      showFooter: true,
    });
    return NextResponse.json({ handout, docxBase64: buffer.toString("base64") }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const quotaResponse = quotaErrorResponse(error);
    if (quotaResponse) return quotaResponse;
    console.error("Handout generation failed", error);
    return NextResponse.json({ error: "Не удалось создать раздаточный материал. Повторите попытку позже." }, { status: 500 });
  }
}
