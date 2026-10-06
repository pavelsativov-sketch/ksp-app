import "server-only";
import { effectivePlan } from "./plans";
import { getPlanForUser } from "./quota";

/**
 * Решение о водяном знаке для экспортов: Pro — без пометки, всё остальное
 * (Free, аноним, сбой биллинга) — с пометкой. Вызывается в export-роутах.
 */
export async function resolveWatermark(user: { id: string } | null): Promise<boolean> {
  if (!user) return true;
  try {
    const billing = await getPlanForUser(user.id);
    return effectivePlan({ plan: billing.plan, plan_expires_at: billing.expiresAt }) === "free";
  } catch {
    return true;
  }
}
