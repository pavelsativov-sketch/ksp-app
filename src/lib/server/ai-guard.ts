/**
 * Shared guard for `/api/ai/*` routes:
 *   1. Require a logged-in user (or accept anonymous when Supabase is unset
 *      so the local stub mode still works).
 *   2. Enforce the per-user, per-endpoint hourly rate limit.
 *
 * Returns either a NextResponse to short-circuit the route, or a `userId`
 * (string) that the route can pass into structured logs.
 */

import { NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { checkAiRateLimit, type AiEndpoint, AI_RATE_LIMITS } from "./rate-limit";
import { logWarn } from "./log";

export type AiGuardResult =
  | { ok: true; userId: string | null }
  | { ok: false; response: NextResponse };

export async function guardAiRoute(
  endpoint: AiEndpoint,
): Promise<AiGuardResult> {
  if (!isSupabaseConfigured()) {
    // Stub/dev mode — no auth, no rate limit.
    return { ok: true, userId: null };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const limit = AI_RATE_LIMITS[endpoint];
  const rl = await checkAiRateLimit(user.id, endpoint, limit);
  if (!rl.allowed) {
    logWarn("ai.rate_limited", {
      userId: user.id,
      endpoint,
      used: rl.used,
      maxPerHour: rl.maxPerHour,
      resetInSec: rl.resetInSec,
    });
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `Превышен лимит ${rl.maxPerHour} AI-запросов в час на этот эндпойнт. Попробуйте через ~${Math.ceil(rl.resetInSec / 60)} мин.`,
          code: "rate_limited",
          used: rl.used,
          maxPerHour: rl.maxPerHour,
          resetInSec: rl.resetInSec,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rl.resetInSec),
            "X-RateLimit-Limit": String(rl.maxPerHour),
            "X-RateLimit-Remaining": String(
              Math.max(0, rl.maxPerHour - rl.used),
            ),
          },
        },
      ),
    };
  }

  return { ok: true, userId: user.id };
}
