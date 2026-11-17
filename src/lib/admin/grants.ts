import "server-only";
import { z } from "zod";
import type { ClientSession, Db } from "mongodb";
import { COL, getDb, toObjectId } from "@/lib/mongo";
import { effectivePlan, type UserBillingFields } from "@/lib/billing/plans";
import { extendPlanExpiry, type ActivationCodeType } from "@/lib/billing/redeem";
import { AdminError, limitAdmin, requireAdmin } from "./auth";

const MAX_BONUS = 1000;
const MAX_UNTIL_MS = 5 * 366 * 86_400_000;

export const tokensSchema = z.object({
  amount: z.number().int().min(-MAX_BONUS).max(MAX_BONUS).refine((n) => n !== 0),
  scope: z.enum(["month", "permanent"]),
}).strict();

const paidPlan = z.literal("pro");
export const subscriptionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("extend"), plan: paidPlan, months: z.union([z.literal(1), z.literal(3), z.literal(12)]) }).strict(),
  z.object({ action: z.literal("until"), plan: paidPlan, until: z.iso.date() }).strict(),
  z.object({ action: z.literal("revoke") }).strict(),
]);

export interface AdminActionDocument {
  admin_id: string;
  target_user_id: string;
  action: "grant_tokens" | "set_subscription";
  payload: Record<string, unknown>;
  at: Date;
}

const MONTHS_TO_TYPE: Record<1 | 3 | 12, ActivationCodeType> = { 1: "pro_1m", 3: "pro_3m", 12: "pro_1y" };

async function withAdminTransaction<T>(db: Db, work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = db.client.startSession();
  try {
    return await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
}

function audit(db: Db, session: ClientSession, doc: AdminActionDocument) {
  return db.collection<AdminActionDocument>(COL.adminActions).insertOne(doc, { session });
}

async function authorizeWrite(userId: string) {
  const admin = await requireAdmin();
  await limitAdmin(admin.id, "create");
  const id = toObjectId(userId);
  if (!id) throw new AdminError(404, "Пользователь не найден.");
  return { admin, id };
}

/**
 * Бонус КСП к месячному лимиту: "month" — только на текущий месяц UTC,
 * "permanent" — к каждому месяцу. Отрицательное число уменьшает бонус, не ниже 0.
 */
export async function grantBonusGenerations(userId: string, input: unknown) {
  const { admin, id } = await authorizeWrite(userId);
  const parsed = tokensSchema.safeParse(input);
  if (!parsed.success) throw new AdminError(400, `Укажите целое число от -${MAX_BONUS} до ${MAX_BONUS}, кроме 0, и срок бонуса.`);
  const { amount, scope } = parsed.data;
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const add = (current: unknown) => ({ $max: [0, { $add: [{ $ifNull: [current, 0] }, amount] }] });
  // Пайплайн-обновление: атомарно, без гонки между чтением и записью.
  const update = scope === "permanent"
    ? [{ $set: { bonus_generations: add("$bonus_generations") } }]
    : [{ $set: { bonus_generations_month: { $cond: [
      { $eq: ["$bonus_generations_month.month", month] },
      { month, count: add("$bonus_generations_month.count") },
      { month, count: Math.max(0, amount) },
    ] } } }];
  const db = await getDb();
  return withAdminTransaction(db, async (session) => {
    const user = await db.collection<UserBillingFields>(COL.users).findOneAndUpdate({ _id: id }, update, {
      session, returnDocument: "after", projection: { bonus_generations: 1, bonus_generations_month: 1 },
    });
    if (!user) throw new AdminError(404, "Пользователь не найден.");
    const result = { permanent: user.bonus_generations ?? 0, thisMonth: user.bonus_generations_month?.month === month ? user.bonus_generations_month.count : 0 };
    await audit(db, session, { admin_id: admin.id, target_user_id: userId, action: "grant_tokens", payload: { amount, scope, month, result }, at: now });
    return result;
  });
}

/** Выдать/продлить или снять подписку — те же поля и plan_events, что и при активации кода. */
export async function setSubscription(userId: string, input: unknown) {
  const { admin, id } = await authorizeWrite(userId);
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) throw new AdminError(400, "Выберите тариф и срок: 1, 3 или 12 месяцев либо дату окончания.");
  const data = parsed.data;
  const now = new Date();
  const db = await getDb();
  return withAdminTransaction(db, async (session) => {
    const users = db.collection<UserBillingFields>(COL.users);
    const user = await users.findOne({ _id: id }, { session, projection: { plan: 1, plan_expires_at: 1 } });
    if (!user) throw new AdminError(404, "Пользователь не найден.");
    let plan: "free" | "pro" = "free";
    let expiresAt: Date | null = null;
    if (data.action === "extend") {
      plan = data.plan;
      // Как у кода активации: продлеваем от действующего окончания, иначе от сегодня.
      const current = effectivePlan(user, now) === "pro" ? user.plan_expires_at : null;
      expiresAt = extendPlanExpiry(current && current > now ? current : now, MONTHS_TO_TYPE[data.months]);
    } else if (data.action === "until") {
      plan = data.plan;
      expiresAt = new Date(`${data.until}T23:59:59.999Z`);
      if (expiresAt <= now || expiresAt.getTime() - now.getTime() > MAX_UNTIL_MS) {
        throw new AdminError(400, "Дата окончания должна быть в будущем и не дальше 5 лет.");
      }
    }
    await users.updateOne({ _id: id }, { $set: { plan, plan_expires_at: expiresAt } }, { session });
    await db.collection(COL.planEvents).insertOne({
      event: data.action === "revoke" ? "admin_subscription_revoked" : "admin_subscription_set",
      user_id: userId, actor_id: admin.id,
      previous_plan: user.plan ?? "free", previous_expires_at: user.plan_expires_at ?? null,
      plan, plan_expires_at: expiresAt, created_at: now,
    }, { session });
    await audit(db, session, {
      admin_id: admin.id, target_user_id: userId, action: "set_subscription",
      payload: { ...data, previous_plan: user.plan ?? "free", previous_expires_at: user.plan_expires_at ?? null, plan, plan_expires_at: expiresAt },
      at: now,
    });
    return { plan, expiresAt: expiresAt?.toISOString() ?? null };
  });
}
