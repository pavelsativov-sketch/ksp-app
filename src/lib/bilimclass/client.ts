/**
 * BilimClass adapter (stub).
 *
 * This module will later push a KSP + its interactive tasks to the
 * https://bilimclass.kz LMS. Right now it's a no-op scaffold so the
 * rest of the codebase can import a stable surface. Replace with a
 * real HTTP client once we have BilimClass API credentials.
 *
 * Env vars expected (future):
 *   BILIMCLASS_API_URL      — e.g. https://api.bilimclass.kz
 *   BILIMCLASS_API_TOKEN    — org-level service token
 */

import type { LessonPlanRow } from "@/lib/types/ksp";

export interface BilimClassPushResult {
  ok: boolean;
  skipped?: boolean;
  externalId?: string;
  message: string;
}

export function isBilimClassConfigured(): boolean {
  return Boolean(process.env.BILIMCLASS_API_URL && process.env.BILIMCLASS_API_TOKEN);
}

export async function pushLessonPlan(
  plan: LessonPlanRow,
): Promise<BilimClassPushResult> {
  if (!isBilimClassConfigured()) {
    return {
      ok: true,
      skipped: true,
      message: "BilimClass не настроен (нет BILIMCLASS_API_URL / BILIMCLASS_API_TOKEN).",
    };
  }

  // TODO: implement real HTTP call once BilimClass gives us the API spec.
  // Expected shape: POST ${BILIMCLASS_API_URL}/lesson-plans
  //   body: { externalId, title, subject, grade, content, tasks }
  //   auth: Bearer $BILIMCLASS_API_TOKEN
  return {
    ok: false,
    message: `BilimClass push ещё не реализован (план ${plan.id}).`,
  };
}
