/**
 * Per-user rate limiting for AI endpoints, backed by the Supabase
 * `check_ai_rate_limit(uid, endpoint, max)` SECURITY DEFINER function
 * (see migration 0007_ai_rate_limit.sql).
 *
 * The DB call is atomic (count + insert in one transaction), so two parallel
 * requests from the same user can't both squeeze through right at the limit.
 */

import { createAdminClient } from "@/lib/supabase/server";

export interface RateLimitResult {
  allowed: boolean;
  used: number;
  maxPerHour: number;
  resetInSec: number;
}

export async function checkAiRateLimit(
  userId: string,
  endpoint: string,
  maxPerHour: number,
): Promise<RateLimitResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("check_ai_rate_limit", {
    p_user_id: userId,
    p_endpoint: endpoint,
    p_max_per_hour: maxPerHour,
  });
  if (error) {
    // Fail-open: don't block users on a transient DB issue. Log loudly so we
    // can investigate in Cloudflare logs.
    console.error("[rate-limit] db error, failing open:", {
      userId,
      endpoint,
      error: error.message,
    });
    return {
      allowed: true,
      used: 0,
      maxPerHour,
      resetInSec: 3600,
    };
  }
  // SECURITY DEFINER set-returning fn returns an array of one row.
  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: Boolean(row?.allowed),
    used: Number(row?.used ?? 0),
    maxPerHour: Number(row?.max_per_hour ?? maxPerHour),
    resetInSec: Number(row?.reset_in_sec ?? 3600),
  };
}

/** Default per-hour limits for each AI endpoint. */
export const AI_RATE_LIMITS = {
  "ai/generate": 20,
  "ai/generate-tasks": 30,
  "ai/enhance": 60,
  "ai/critique": 30,
  "ai/generate-assessment": 15,
  "ai/translate": 10,
} as const;

export type AiEndpoint = keyof typeof AI_RATE_LIMITS;
