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
  topic: z.string().trim().min(1),
  subject: z.string().trim().min(1),
  grade: z.coerce.number().int().min(1).max(11),
  language: z.enum(["ru", "kz"]).default("ru"),
  count: z.coerce.number().int().min(3).max(30).default(8),
  withImages: optionalBooleanFlag,
  cardLayout: optionalBooleanFlag,
  customWords: z.array(z.object({
    word: z.string().trim().min(1).max(30),
    clue: z.string().trim().min(1).max(500),
  })).max(15).optional(),
}).superRefine((value, ctx) => {
  if (value.kind === "worksheet" && value.count > 10) {
    ctx.addIssue({ code: "custom", path: ["count"], message: "В рабочем листе может быть не более 10 заданий: сумма баллов должна равняться 10." });
  }
});

const KIND_LABEL: Record<z.infer<typeof bodySchema>["kind"], string> = {
  worksheet: "Рабочий лист",
  flashcards: "Памятки",
  crossword: "Кроссворд",
};

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

  let buffer: Buffer;
  try {
    const handout = await generateHandout({ ...parsed.data, quota: handoutQuota(auth.user.id) });
    const watermark = await resolveWatermark(auth.user);
    buffer = await buildHandoutDocx(handout, { watermark });
  } catch (error) {
    const quotaResponse = quotaErrorResponse(error);
    if (quotaResponse) return quotaResponse;
    // Внутренние детали (ошибки провайдеров) наружу не раскрываем.
    return NextResponse.json(
      { error: "Не удалось создать раздаточный материал. Попробуйте ещё раз." },
      { status: 502 },
    );
  }
  const filename = `${KIND_LABEL[parsed.data.kind]} — ${parsed.data.topic}.docx`.replace(
    /[^\p{L}\p{N}_\-. ]/gu,
    "_",
  );

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
