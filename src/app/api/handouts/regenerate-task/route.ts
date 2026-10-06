import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { regenerateWorksheetTask } from "@/lib/handouts/generate";
import { reserveQuotaOrResponse } from "@/lib/billing/quota";

export const runtime = "nodejs";

const TASK_TYPES = [
  "open", "fill", "multiple_choice", "match", "true_false",
  "sort", "checklist", "case_study", "fill_bank", "table_fix",
  "scenario_fix", "choice_buttons", "reflection", "interactive", "creative",
] as const;

/**
 * Точечная замена одного задания рабочего листа: тот же тип, этап и баллы —
 * сумма листа не меняется, остальное не трогаем.
 */
const bodySchema = z.object({
  topic: z.string().trim().min(1).max(2_000),
  subject: z.string().trim().min(1).max(200),
  grade: z.coerce.number().int().min(1).max(11),
  language: z.enum(["ru", "kz"]).default("ru"),
  type: z.enum(TASK_TYPES),
  stage: z.enum(["start", "middle", "end"]).default("middle"),
  points: z.coerce.number().int().min(0).max(10).default(1),
  avoidPrompts: z.array(z.string().max(1000)).max(10).optional().default([]),
  kspContext: z.object({
    learningObjectives: z.array(z.string()).default([]),
    assessmentCriteria: z.array(z.string()).default([]),
    stages: z.array(z.object({ stage: z.string(), activities: z.string() })).default([]),
  }).optional(),
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

  // Замена одного задания — тоже вызов AI, значит тоже под квотой.
  const quota = await reserveQuotaOrResponse(auth.user, "assist");
  if (!quota.ok) return quota.response;

  try {
    const task = await regenerateWorksheetTask(parsed.data);
    return NextResponse.json({ task, quota: { remaining: quota.reservation.remaining } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await quota.reservation.finalize(false);
    console.error("Task regeneration failed", error);
    return NextResponse.json({ error: "Не удалось заменить задание. Повторите попытку позже." }, { status: 500 });
  }
}
