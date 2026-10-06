import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { generateImage } from "@/lib/ai/image";
import { reserveQuotaOrResponse } from "@/lib/billing/quota";

const bodySchema = z.object({
  prompt: z.string().trim().min(3).max(2_000),
  topic: z.string().trim().max(500).optional(),
  subject: z.string().trim().max(200).optional(),
  grade: z.coerce.number().int().min(1).max(11).optional(),
});

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const rl = await checkRateLimitAsync(`img:${auth.user.id}`, 20, 3600_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Превышен лимит запросов на генерацию изображений." },
      { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))) } },
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

  const quota = await reserveQuotaOrResponse(auth.user, "image");
  if (!quota.ok) return quota.response;
  const { reservation } = quota;

  try {
    const result = await generateImage(parsed.data);
    return NextResponse.json({
      image: `data:${result.mimeType};base64,${result.base64}`,
      provider: result.provider,
      quota: { remaining: reservation.remaining },
    });
  } catch (error) {
    await reservation.finalize(false);
    console.error("Image generation failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Не удалось сгенерировать изображение. Повторите попытку позже." }, { status: 500 });
  }
}
