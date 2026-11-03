import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { reserveQuotaOrResponse } from "@/lib/billing/quota";
import { COL, getDb, toObjectId } from "@/lib/mongo";
import { getPlanById } from "@/lib/plans-repo";
import { MAX_CHOICES, generateInteractiveTasks } from "@/lib/materials/generate";
import { INTERACTIVE_FORMATS } from "@/lib/materials/interactive-formats";

export const runtime = "nodejs";
export const maxDuration = 120;

/** На этап в КСП допустимо не более 20 заданий (kspContentSchema). */
const MAX_TASKS_PER_STAGE = 20;

const bodySchema = z.object({
  planId: z.string().regex(/^[0-9a-f]{24}$/i),
  format: z.enum(INTERACTIVE_FORMATS).default("mcq"),
  count: z.coerce.number().int().min(1).max(MAX_CHOICES).default(7),
});

/**
 * Интерактив выбранного формата: ИИ делает задания и дописывает их в середину урока.
 * Дальше они выдаются ученикам существующей кнопкой «Выдать задание» (код для класса).
 */
export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const rl = await checkRateLimitAsync(`ai:${auth.user.id}`, 30, 3600_000);
  if (!rl.ok) return NextResponse.json({ error: "Превышен лимит запросов. Попробуйте позже." }, { status: 429 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: `Нужен planId, формат и число заданий до ${MAX_CHOICES}` }, { status: 400 });

  const plan = await getPlanById(parsed.data.planId);
  if (!plan || plan.owner_id !== auth.user.id) return NextResponse.json({ error: "План не найден среди ваших планов" }, { status: 404 });

  const existing = plan.content.stages.middle.tasks ?? [];
  if (existing.length + parsed.data.count > MAX_TASKS_PER_STAGE) {
    return NextResponse.json(
      { error: `В середине урока уже ${existing.length} заданий, всего допустимо ${MAX_TASKS_PER_STAGE}. Удалите лишние или выберите меньше заданий.` },
      { status: 409 },
    );
  }

  const quota = await reserveQuotaOrResponse(auth.user, "generation");
  if (!quota.ok) return quota.response;

  try {
    const created = await generateInteractiveTasks(plan, parsed.data.format, parsed.data.count);
    const db = await getDb();
    await db.collection(COL.plans).updateOne(
      { _id: toObjectId(plan.id)!, owner_id: auth.user.id },
      { $set: { "content.stages.middle.tasks": [...existing, ...created], updated_at: new Date() } },
    );
    await quota.reservation.finalize(true);
    return NextResponse.json({ added: created.length, total: existing.length + created.length });
  } catch (error) {
    await quota.reservation.finalize(false).catch(() => undefined);
    console.error("Interactive generation failed", error);
    return NextResponse.json({ error: "Не удалось составить интерактив. Повторите попытку позже." }, { status: 503 });
  }
}
