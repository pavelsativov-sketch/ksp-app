import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { generateImage, isImageProviderConfigured } from "@/lib/ai/image";
import { autoDetectDiagramSpec, buildEducationalSvg, svgToDataUri } from "@/lib/ai/svg-diagram";
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

  const svgFallback = (remaining?: number | null) =>
    NextResponse.json({
      image: svgToDataUri(buildEducationalSvg(autoDetectDiagramSpec(parsed.data))),
      provider: "svg-diagram",
      fallback: true,
      ...(remaining === undefined ? {} : { quota: { remaining } }),
    });

  // Без провайдера слот квоты не резервируем: сразу отдаём SVG-схему.
  if (!isImageProviderConfigured()) return svgFallback();

  const quota = await reserveQuotaOrResponse(auth.user, "image");
  if (!quota.ok) return quota.response;
  const { reservation } = quota;

  try {
    const result = await generateImage(parsed.data);
    await reservation.finalize(true);
    return NextResponse.json({
      image: `data:${result.mimeType};base64,${result.base64}`,
      provider: result.provider,
      quota: { remaining: reservation.remaining },
    });
  } catch (error) {
    await reservation.finalize(false);
    console.warn("Image generation fallback to educational SVG:", error instanceof Error ? error.name : "UnknownError");
    return svgFallback(reservation.remaining);
  }
}
