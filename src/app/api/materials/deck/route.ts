import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { reserveQuotaOrResponse } from "@/lib/billing/quota";
import { getPlanById } from "@/lib/plans-repo";
import { deckRequestSchema, generateDeckOutline } from "@/lib/materials/deck";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Шаг 1 конструктора: ИИ разбирает КСП и предлагает слайды. Файл здесь ещё не создаётся. */
export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const rl = await checkRateLimitAsync(`ai:${auth.user.id}`, 30, 3600_000);
  if (!rl.ok) return NextResponse.json({ error: "Превышен лимит запросов. Попробуйте позже." }, { status: 429 });

  const parsed = deckRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Не указан план" }, { status: 400 });

  const plan = await getPlanById(parsed.data.planId);
  if (!plan || plan.owner_id !== auth.user.id) return NextResponse.json({ error: "План не найден среди ваших планов" }, { status: 404 });

  const quota = await reserveQuotaOrResponse(auth.user, "generation");
  if (!quota.ok) return quota.response;

  try {
    const { slides, fromAi } = await generateDeckOutline(plan);
    await quota.reservation.finalize(fromAi);
    return NextResponse.json({ slides, fromAi });
  } catch (error) {
    await quota.reservation.finalize(false).catch(() => undefined);
    console.error("Deck outline failed", error);
    return NextResponse.json({ error: "Не удалось разобрать план. Повторите попытку позже." }, { status: 503 });
  }
}
