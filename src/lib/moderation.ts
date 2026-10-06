import "server-only";
import { z } from "zod";
import { ObjectId } from "mongodb";
import { COL, getDb, toObjectId } from "@/lib/mongo";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getPlanById, type PlanDoc } from "@/lib/plans-repo";
import { AdminError, limitAdmin, requireAdmin } from "@/lib/admin/auth";
import { REPORT_REASONS, REPORT_REASON_LABEL, type ReportReason } from "@/lib/report-reasons";
export { REPORT_REASONS, REPORT_REASON_LABEL, type ReportReason };

/**
 * Модерация библиотеки: жалобы пользователей + скрытие планов.
 * Скрытый план пропадает из библиотеки и по прямым ссылкам для всех,
 * кроме владельца (см. getAccessiblePlan).
 */

export type ReportStatus = "open" | "resolved";

export interface PlanReportDoc {
  _id?: ObjectId;
  plan_id: string;
  reporter_id: string;
  reason: ReportReason;
  details?: string;
  status: ReportStatus;
  resolved_by?: string | null;
  resolved_at?: Date | null;
  created_at: Date;
}

const reportSchema = z.object({
  planId: z.string().regex(/^[a-f\d]{24}$/i, "Некорректный идентификатор плана"),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(500).optional().default(""),
});

/** Жалоба на чужой публичный план. Возвращает человекочитаемый итог. */
export async function reportPlan(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Требуется вход" };
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Некорректные данные жалобы" };

  const rate = await checkRateLimitAsync(`moderation:report:${user.id}`, 10, 3600_000);
  if (!rate.ok) return { ok: false, error: "Слишком много жалоб. Попробуйте позже." };

  try {
    const plan = await getPlanById(parsed.data.planId);
    if (!plan || plan.visibility !== "public" || plan.moderationHidden) {
      return { ok: false, error: "План недоступен для жалобы" };
    }
    if (plan.owner_id === user.id) return { ok: false, error: "Нельзя пожаловаться на свой план" };

    const db = await getDb();
    const existing = await db.collection<PlanReportDoc>(COL.planReports).findOne({
      plan_id: parsed.data.planId, reporter_id: user.id, status: "open",
    });
    if (existing) return { ok: false, error: "Жалоба уже отправлена и ждёт рассмотрения" };

    await db.collection<PlanReportDoc>(COL.planReports).insertOne({
      plan_id: parsed.data.planId,
      reporter_id: user.id,
      reason: parsed.data.reason,
      details: parsed.data.details || undefined,
      status: "open",
      created_at: new Date(),
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "Не удалось отправить жалобу. Попробуйте позже." };
  }
}

export interface ModerationQueueItem {
  id: string;
  planId: string;
  planTitle: string;
  planOwnerId: string;
  hidden: boolean;
  reason: string;
  details: string | null;
  reporterEmail: string | null;
  createdAt: string | null;
  openCount: number;
}

/** Очередь жалоб для админки: открытые жалобы + счётчик жалоб по плану. */
export async function listModerationQueue(): Promise<ModerationQueueItem[]> {
  const admin = await requireAdmin();
  await limitAdmin(admin.id, "read");
  const db = await getDb();
  const reports = await db.collection<PlanReportDoc>(COL.planReports)
    .find({ status: "open" })
    .sort({ created_at: -1, _id: -1 })
    .limit(100)
    .toArray();

  const planIds = [...new Set(reports.map((r) => r.plan_id))];
  const plans = planIds.length
    ? await db.collection<PlanDoc>(COL.plans)
      .find({ _id: { $in: planIds.map((id) => new ObjectId(id)) } })
      .project({ title: 1, owner_id: 1, moderation_hidden: 1 })
      .toArray()
    : [];
  const planMap = new Map(plans.map((p) => [p._id.toString(), p]));
  const reporterIds = [...new Set(reports.map((r) => r.reporter_id))];
  const reporterOids = reporterIds
    .map((id) => toObjectId(id))
    .filter((oid): oid is ObjectId => oid !== null);
  const reporters = reporterOids.length
    ? await db.collection(COL.users)
      .find({ _id: { $in: reporterOids } })
      .project({ email: 1 })
      .toArray()
    : [];
  const reporterMap = new Map(reporters.map((u) => [u._id.toString(), u.email as string]));
  const openCounts = new Map<string, number>();
  for (const r of reports) openCounts.set(r.plan_id, (openCounts.get(r.plan_id) ?? 0) + 1);

  return reports.map((r) => {
    const plan = planMap.get(r.plan_id);
    return {
      id: r._id.toString(),
      planId: r.plan_id,
      planTitle: plan?.title ?? "(план удалён)",
      planOwnerId: plan?.owner_id ?? "",
      hidden: plan?.moderation_hidden === true,
      reason: REPORT_REASON_LABEL[r.reason] ?? r.reason,
      details: r.details ?? null,
      reporterEmail: reporterMap.get(r.reporter_id) ?? null,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : null,
      openCount: openCounts.get(r.plan_id) ?? 1,
    };
  });
}

const idSchema = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }).strict();
const planIdSchema = z.object({ planId: z.string().regex(/^[a-f\d]{24}$/i) }).strict();

/** Скрыть план из библиотеки (или вернуть обратно). Пишет аудит в plan_events. */
export async function setPlanHidden(input: unknown, hidden: boolean) {
  const admin = await requireAdmin();
  await limitAdmin(admin.id, "revoke");
  const parsed = planIdSchema.safeParse(input);
  if (!parsed.success) throw new AdminError(400, "Некорректный идентификатор плана.");
  const db = await getDb();
  const now = new Date();
  const updated = await db.collection<PlanDoc>(COL.plans).findOneAndUpdate(
    { _id: new ObjectId(parsed.data.planId) },
    hidden
      ? { $set: { moderation_hidden: true, hidden_at: now, hidden_by: admin.id } }
      : { $set: { moderation_hidden: false }, $unset: { hidden_at: "", hidden_by: "" } },
    { returnDocument: "after", projection: { _id: 1, owner_id: 1 } },
  );
  if (!updated) throw new AdminError(404, "План не найден.");
  await db.collection(COL.planEvents).insertOne({
    event: hidden ? "moderation_hide" : "moderation_unhide",
    user_id: updated.owner_id, actor_id: admin.id,
    plan_id: parsed.data.planId, created_at: now,
  });
  return { ok: true as const };
}

/** Закрыть жалобу как рассмотренную. */
export async function resolveReport(input: unknown) {
  const admin = await requireAdmin();
  await limitAdmin(admin.id, "revoke");
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) throw new AdminError(400, "Некорректный идентификатор жалобы.");
  const db = await getDb();
  const updated = await db.collection<PlanReportDoc>(COL.planReports).findOneAndUpdate(
    { _id: new ObjectId(parsed.data.id), status: "open" },
    { $set: { status: "resolved", resolved_by: admin.id, resolved_at: new Date() } },
  );
  if (!updated) throw new AdminError(409, "Жалоба уже рассмотрена или не существует.");
  return { ok: true as const };
}
