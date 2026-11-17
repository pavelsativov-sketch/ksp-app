import "server-only";
import { COL, getDb, toObjectId } from "@/lib/mongo";
import type { UserDoc } from "@/lib/auth";
import { bonusGenerations, effectiveLimits, effectivePlan, type UserBillingFields } from "@/lib/billing/plans";
import { utcMonthWindow } from "@/lib/billing/quota";
import { AdminError, limitAdmin, requireAdmin } from "./auth";
import { parseAdminQuery, userSearchFilter, type AdminSearchParams } from "./queries";

const DAY = 86_400_000;
const PAGE_SIZE = 25;
const CHART_DAYS = 30;
const options = { maxTimeMS: 10000 };
type AdminUser = UserDoc & UserBillingFields;
const iso = (value?: Date | null) => value instanceof Date ? value.toISOString() : null;
const dayKey = (value: Date) => value.toISOString().slice(0, 10);

export interface DailyPoint { day: string; users: number; plans: number; generations: number }

/** Пустые дни тоже нужны графику: заполняем 30 дней нулями и накладываем агрегаты. */
export function fillDays(now: Date, rows: Record<"users" | "plans" | "generations", Array<{ _id: string; count: number }>>): DailyPoint[] {
  const maps = Object.fromEntries(Object.entries(rows).map(([key, list]) => [key, new Map(list.map((r) => [r._id, r.count]))]));
  return Array.from({ length: CHART_DAYS }, (_, index) => {
    const day = dayKey(new Date(now.getTime() - (CHART_DAYS - 1 - index) * DAY));
    return { day, users: maps.users.get(day) ?? 0, plans: maps.plans.get(day) ?? 0, generations: maps.generations.get(day) ?? 0 };
  });
}

export async function getAdminOverview() {
  const admin = await requireAdmin();
  await limitAdmin(admin.id, "read");
  const db = await getDb();
  const now = new Date();
  const since = (days: number) => new Date(now.getTime() - days * DAY);
  const users = db.collection<AdminUser>(COL.users);
  const plans = db.collection(COL.plans);
  const events = db.collection(COL.aiEvents);
  const chartStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (CHART_DAYS - 1)));
  const perDay = (field: string) => [{ $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: `$${field}` } }, count: { $sum: 1 } } }];
  const slot = (from: Date) => ({ kind: "slot", task: "generation", createdAt: { $gte: from } });
  const failures = (from: Date) => ({ kind: "telemetry", ok: false, createdAt: { $gte: from } });
  const [
    totalUsers, new7, new30, plans7, plans30, gen7, gen30, fail7, fail30, proUsers,
    active, usersDaily, plansDaily, generationsDaily,
  ] = await Promise.all([
    users.countDocuments({}, options),
    users.countDocuments({ created_at: { $gte: since(7) } }, options),
    users.countDocuments({ created_at: { $gte: since(30) } }, options),
    plans.countDocuments({ created_at: { $gte: since(7) } }, options),
    plans.countDocuments({ created_at: { $gte: since(30) } }, options),
    events.countDocuments(slot(since(7)), options),
    events.countDocuments(slot(since(30)), options),
    events.countDocuments(failures(since(7)), options),
    events.countDocuments(failures(since(30)), options),
    users.countDocuments({ plan: "pro", $or: [{ plan_expires_at: null }, { plan_expires_at: { $gt: now } }] }, options),
    // Активный = менял план или обращался к AI за 7 дней; объединение считается в Mongo.
    plans.aggregate<{ count: number }>([
      { $match: { updated_at: { $gte: since(7) } } }, { $project: { _id: 0, u: "$owner_id" } },
      { $unionWith: { coll: COL.aiEvents, pipeline: [
        { $match: { createdAt: { $gte: since(7) }, user_id: { $type: "string" } } }, { $project: { _id: 0, u: "$user_id" } },
      ] } },
      { $group: { _id: "$u" } }, { $count: "count" },
    ], options).toArray(),
    users.aggregate<{ _id: string; count: number }>([{ $match: { created_at: { $gte: chartStart } } }, ...perDay("created_at")], options).toArray(),
    plans.aggregate<{ _id: string; count: number }>([{ $match: { created_at: { $gte: chartStart } } }, ...perDay("created_at")], options).toArray(),
    events.aggregate<{ _id: string; count: number }>([{ $match: slot(chartStart) }, ...perDay("createdAt")], options).toArray(),
  ]);
  return {
    totalUsers, newUsers7: new7, newUsers30: new30,
    activeUsers7: active[0]?.count ?? 0,
    plans7, plans30, generations7: gen7, generations30: gen30, failures7: fail7, failures30: fail30,
    tiers: { pro: proUsers, free: totalUsers - proUsers },
    daily: fillDays(now, { users: usersDaily, plans: plansDaily, generations: generationsDaily }),
  };
}

export async function listAdminUsers(input: AdminSearchParams) {
  const admin = await requireAdmin();
  await limitAdmin(admin.id, "read");
  const { q, page: requested } = parseAdminQuery(input);
  const db = await getDb();
  const now = new Date();
  const { start, end } = utcMonthWindow(now);
  const users = db.collection<AdminUser>(COL.users);
  const filter = userSearchFilter(q);
  const total = await users.countDocuments(filter, options);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requested, pages);
  const rows = await users.find(filter, {
    ...options,
    projection: { _id: 1, email: 1, full_name: 1, created_at: 1, plan: 1, plan_expires_at: 1, bonus_generations: 1, bonus_generations_month: 1 },
  }).sort({ created_at: -1, _id: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).toArray();
  const ids = rows.map((u) => u._id.toHexString());
  const [usage, planStats, lastAi] = ids.length ? await Promise.all([
    db.collection(COL.aiEvents).aggregate<{ _id: string; count: number }>([
      { $match: { user_id: { $in: ids }, task: "generation", kind: "slot", createdAt: { $gte: start, $lt: end } } },
      { $group: { _id: "$user_id", count: { $sum: 1 } } },
    ], options).toArray(),
    db.collection(COL.plans).aggregate<{ _id: string; count: number; last: Date | null }>([
      { $match: { owner_id: { $in: ids } } },
      { $group: { _id: "$owner_id", count: { $sum: 1 }, last: { $max: "$updated_at" } } },
    ], options).toArray(),
    db.collection(COL.aiEvents).aggregate<{ _id: string; last: Date }>([
      { $match: { user_id: { $in: ids } } },
      { $group: { _id: "$user_id", last: { $max: "$createdAt" } } },
    ], options).toArray(),
  ]) : [[], [], []];
  const used = new Map(usage.map((r) => [r._id, r.count]));
  const planMap = new Map(planStats.map((r) => [r._id, r]));
  const aiMap = new Map(lastAi.map((r) => [r._id, r.last]));
  return {
    q, page, pages, total,
    users: rows.map((u) => {
      const id = u._id.toHexString();
      const latest = [planMap.get(id)?.last, aiMap.get(id)].filter((d): d is Date => d instanceof Date).sort((a, b) => b.getTime() - a.getTime())[0];
      return {
        id, email: u.email, name: u.full_name, createdAt: iso(u.created_at),
        plan: effectivePlan(u, now), expiresAt: iso(u.plan_expires_at),
        generationsUsed: used.get(id) ?? 0, generationsLimit: effectiveLimits(u, now).kspPerMonth,
        plansCount: planMap.get(id)?.count ?? 0, lastActivity: iso(latest),
      };
    }),
  };
}

export async function getAdminUserDetail(userId: string) {
  const admin = await requireAdmin();
  await limitAdmin(admin.id, "read");
  const id = toObjectId(userId);
  if (!id) throw new AdminError(404, "Пользователь не найден.");
  const db = await getDb();
  const user = await db.collection<AdminUser>(COL.users).findOne({ _id: id }, {
    ...options,
    projection: { _id: 1, email: 1, full_name: 1, created_at: 1, plan: 1, plan_expires_at: 1, bonus_generations: 1, bonus_generations_month: 1 },
  });
  if (!user) throw new AdminError(404, "Пользователь не найден.");
  const now = new Date();
  const { start, end } = utcMonthWindow(now);
  const [usage, plansCount, recentPlans, recentEvents, actions] = await Promise.all([
    db.collection(COL.aiEvents).aggregate<{ _id: string; count: number }>([
      { $match: { user_id: userId, kind: "slot", createdAt: { $gte: start, $lt: end } } },
      { $group: { _id: "$task", count: { $sum: 1 } } },
    ], options).toArray(),
    db.collection(COL.plans).countDocuments({ owner_id: userId }, options),
    db.collection(COL.plans).find({ owner_id: userId }, { ...options, projection: { _id: 1, title: 1, created_at: 1, updated_at: 1 } })
      .sort({ updated_at: -1 }).limit(10).toArray(),
    // Только метаданные: в истории AI лежат тексты запросов учителя.
    db.collection(COL.aiEvents).find({ user_id: userId }, { ...options, projection: { _id: 1, task: 1, kind: 1, ok: 1, createdAt: 1 } })
      .sort({ createdAt: -1 }).limit(20).toArray(),
    db.collection(COL.adminActions).find({ target_user_id: userId }, { ...options, projection: { _id: 1, admin_id: 1, action: 1, payload: 1, at: 1 } })
      .sort({ at: -1 }).limit(20).toArray(),
  ]);
  const count = (task: string) => usage.find((r) => r._id === task)?.count ?? 0;
  const limits = effectiveLimits(user, now);
  return {
    id: userId, email: user.email, name: user.full_name, createdAt: iso(user.created_at),
    plan: effectivePlan(user, now), storedPlan: user.plan ?? "free", expiresAt: iso(user.plan_expires_at),
    bonusPermanent: user.bonus_generations ?? 0, bonusThisMonth: bonusGenerations(user, now) - (user.bonus_generations ?? 0),
    usage: {
      generations: { used: count("generation"), limit: limits.kspPerMonth },
      assist: { used: count("assist"), limit: limits.assistPerMonth },
      images: { used: count("image"), limit: limits.images },
    },
    plansCount,
    recentPlans: recentPlans.map((p) => ({ id: String(p._id), title: typeof p.title === "string" ? p.title : "Без названия", updatedAt: iso(p.updated_at as Date) })),
    recentEvents: recentEvents.map((e) => ({ id: String(e._id), task: String(e.task ?? "—"), kind: String(e.kind ?? "—"), ok: e.ok !== false, at: iso(e.createdAt as Date) })),
    actions: actions.map((a) => ({ id: String(a._id), adminId: String(a.admin_id), action: String(a.action), payload: JSON.stringify(a.payload ?? {}), at: iso(a.at as Date) })),
  };
}

export type AdminOverview = Awaited<ReturnType<typeof getAdminOverview>>;
export type AdminUserList = Awaited<ReturnType<typeof listAdminUsers>>;
export type AdminUserDetail = Awaited<ReturnType<typeof getAdminUserDetail>>;

/**
 * Генерация одноразовой ссылки сброса пароля администратором (когда почтовый шлюз не настроен
 * или учитель обратился в поддержку). Ссылка живёт 2 часа, в БД хранится только SHA-256 хеш.
 */
export async function createAdminPasswordResetLink(input: unknown): Promise<{
  email: string;
  resetUrl: string;
  expiresAt: string;
}> {
  const admin = await requireAdmin();
  await limitAdmin(admin.id, "create");

  const rawEmail =
    typeof (input as { email?: unknown } | null)?.email === "string"
      ? ((input as { email: string }).email).trim().toLowerCase()
      : "";
  if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    throw new AdminError(400, "Укажите корректный email пользователя.");
  }

  const db = await getDb();
  const user = await db.collection<AdminUser>(COL.users).findOne(
    { email: rawEmail },
    { ...options, projection: { _id: 1, email: 1, session_version: 1 } },
  );
  if (!user) {
    throw new AdminError(404, "Пользователь с таким email не найден.");
  }

  const { createHash, randomBytes } = await import("node:crypto");
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 2 * 60 * 60_000);

  await db.collection(COL.passwordResets).insertOne({
    userId: user._id.toHexString(),
    sessionVersion: user.session_version ?? 0,
    tokenHash,
    expiresAt,
    createdAt: now,
  });

  await db.collection(COL.adminActions).insertOne({
    admin_id: admin.id,
    target_user_id: user._id.toHexString(),
    action: "password_reset_link",
    payload: { email: user.email, expiresAt: expiresAt.toISOString() },
    at: now,
  });

  const base = (process.env.APP_URL || "https://ksp-app-pi.vercel.app").replace(/\/+$/, "");
  const resetUrl = `${base}/reset-password?token=${encodeURIComponent(token)}`;
  return { email: user.email, resetUrl, expiresAt: expiresAt.toISOString() };
}
