import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { enhanceSection, TOP_LEVEL_SECTIONS, STAGE_SECTIONS } from "@/lib/ai/enhance";
import { reserveQuotaOrResponse } from "@/lib/billing/quota";

const bodySchema = z.object({
  section: z.enum([...TOP_LEVEL_SECTIONS, ...STAGE_SECTIONS] as [string, ...string[]]),
  stage: z.enum(["beginning", "middle", "end"]).optional(),
  current: z.union([z.string().max(5_000), z.array(z.string().max(2_000)).max(50)]),
  context: z
    .object({
      topic: z.string().max(2_000).optional(),
      subject: z.string().max(200).optional(),
      grade: z.coerce.number().int().optional(),
      language: z.enum(["ru", "kz"]).default("ru"),
    })
    .partial()
    .default({}),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
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

    // Улучшение секции — вспомогательная AI-операция, тоже под тарифной квотой.
    const quota = await reserveQuotaOrResponse(auth.user, "assist");
    if (!quota.ok) return quota.response;

    try {
      const result = await enhanceSection(parsed.data);
      await quota.reservation.finalize(true);
      return NextResponse.json({ ...result, quota: { remaining: quota.reservation.remaining } });
    } catch (error) {
      await quota.reservation.finalize(false);
      if (error instanceof Error && error.message.includes("stage is required")) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (error instanceof Error && error.message.includes("Не настроен AI-провайдер")) {
        return NextResponse.json({ error: error.message }, { status: 503 });
      }
      console.error("Enhance error:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  } catch (error) {
    console.error("Enhance error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
