import "server-only";
import type { Filter } from "mongodb";
import { COL, getDb, toObjectId } from "@/lib/mongo";
import type { UserDoc } from "@/lib/auth";
import { effectivePlan, type UserBillingFields } from "@/lib/billing/plans";
import { utcMonthWindow } from "@/lib/billing/quota";
import { limitAdmin, requireAdmin } from "./auth";
import type { AdminCodeDocument } from "./codes";

export type AdminSearchParams = Record<string, string | string[] | undefined>;
const PAGE_SIZE = 25;
const MAX_PAGE = 10000;
const options = { maxTimeMS: 10000 };
const scalar = (value: unknown) => typeof value === "string" ? value : "";
export function parseAdminQuery(input: AdminSearchParams) {
  const page = (value: unknown) => /^\d{1,5}$/.test(scalar(value)) ? Math.min(MAX_PAGE, Math.max(1, Number(value))) : 1;
  const status = scalar(input.status);
  return {
    q: scalar(input.q).trim().slice(0, 100), page: page(input.page), codePage: page(input.codePage),
    status: status === "active" || status === "redeemed" || status === "revoked" ? status : "all",
  };
}

type AdminUser = UserDoc & UserBillingFields;
export function userSearchFilter(q: string): Filter<AdminUser> {
  if (!q) return {};
  // Treat all search input as literal text, never as a Mongo operator or regex program.
  const text = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  const id = toObjectId(q);
  return { $or: [{ email: text }, { full_name: text }, ...(id ? [{ _id: id }] : [])] };
}
const date = (value?: Date | null) => value instanceof Date ? value.toISOString() : null;

export async function getAdminDashboard(input: AdminSearchParams) {
  const admin = await requireAdmin();
  await limitAdmin(admin.id, "read");
  const query = parseAdminQuery(input);
  const db = await getDb();
  const now = new Date();
  const { start, end } = utcMonthWindow(now);
  const monthFilter = { createdAt: { $gte: start, $lt: end } };
  const users = db.collection<AdminUser>(COL.users);
  const codes = db.collection<AdminCodeDocument>(COL.billingCodes);
  const filter = userSearchFilter(query.q);
  const codeFilter: Filter<AdminCodeDocument> = query.status === "all" ? {} : { status: query.status as AdminCodeDocument["status"] };
  const [totalUsers, matchedUsers, totalCodes, proUsers, usage, telemetry, codeStats] = await Promise.all([
    users.countDocuments({}, options), users.countDocuments(filter, options), codes.countDocuments(codeFilter, options),
    users.countDocuments({ plan: "pro", $or: [{ plan_expires_at: null }, { plan_expires_at: { $gt: now } }] }, options),
    db.collection(COL.aiEvents).aggregate<{ _id: string; count: number }>([
      { $match: { ...monthFilter, user_id: { $type: "string" }, task: { $in: ["generation", "image"] } } },
      { $group: { _id: "$task", count: { $sum: 1 } } },
    ], options).toArray(),
    db.collection(COL.aiEvents).aggregate<{ _id: null; requests: number; errors: number; tokens: number; avgDuration: number }>([
      { $match: { ...monthFilter, provider: { $type: "string" }, ok: { $type: "bool" } } },
      { $group: { _id: null, requests: { $sum: 1 }, errors: { $sum: { $cond: ["$ok", 0, 1] } },
        tokens: { $sum: { $add: [{ $ifNull: ["$prompt_tokens", 0] }, { $ifNull: ["$completion_tokens", 0] }] } },
        avgDuration: { $avg: "$duration_ms" } } },
    ], options).toArray(),
    codes.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }], options).toArray(),
  ]);
  const pages = Math.max(1, Math.min(MAX_PAGE, Math.ceil(matchedUsers / PAGE_SIZE)));
  const codePages = Math.max(1, Math.min(MAX_PAGE, Math.ceil(totalCodes / PAGE_SIZE)));
  query.page = Math.min(query.page, pages);
  query.codePage = Math.min(query.codePage, codePages);
  const [userRows, codeRows] = await Promise.all([
    users.find(filter, { ...options, projection: { _id: 1, email: 1, full_name: 1, created_at: 1, plan: 1, plan_expires_at: 1 } })
      .sort({ created_at: -1, _id: -1 }).skip((query.page - 1) * PAGE_SIZE).limit(PAGE_SIZE).toArray(),
    // Inclusion projection AND explicit DTO: legacy notes/unknown fields cannot disclose codes.
    codes.find(codeFilter, { ...options, projection: { _id: 1, type: 1, status: 1, created_at: 1, created_by: 1, redeemed_by: 1, redeemed_at: 1, revoked_by: 1, revoked_at: 1 } })
      .sort({ created_at: -1, _id: -1 }).skip((query.codePage - 1) * PAGE_SIZE).limit(PAGE_SIZE).toArray(),
  ]);
  const perUser = userRows.length ? await db.collection(COL.aiEvents).aggregate<{ _id: { user: string; task: string }; count: number }>([
    { $match: { ...monthFilter, user_id: { $in: userRows.map((u) => u._id.toHexString()) }, task: { $in: ["generation", "image"] } } },
    { $group: { _id: { user: "$user_id", task: "$task" }, count: { $sum: 1 } } },
  ], options).toArray() : [];
  const counts = new Map(perUser.map((row) => [`${row._id.user}:${row._id.task}`, row.count]));
  return {
    query, pages, codePages, matchedUsers, totalCodes,
    stats: { totalUsers, proUsers, freeUsers: totalUsers - proUsers, month: start.toISOString().slice(0, 7),
      generations: usage.find((r) => r._id === "generation")?.count ?? 0,
      images: usage.find((r) => r._id === "image")?.count ?? 0,
      requests: telemetry[0]?.requests ?? 0, errors: telemetry[0]?.errors ?? 0,
      tokens: telemetry[0]?.tokens ?? 0, avgDuration: Math.round(telemetry[0]?.avgDuration ?? 0),
      activeCodes: codeStats.find((r) => r._id === "active")?.count ?? 0,
      redeemedCodes: codeStats.find((r) => r._id === "redeemed")?.count ?? 0,
      revokedCodes: codeStats.find((r) => r._id === "revoked")?.count ?? 0,
    },
    users: userRows.map((u) => ({ id: u._id.toHexString(), email: u.email, name: u.full_name,
      createdAt: date(u.created_at), plan: effectivePlan(u, now), expiresAt: date(u.plan_expires_at),
      generations: counts.get(`${u._id.toHexString()}:generation`) ?? 0,
      images: counts.get(`${u._id.toHexString()}:image`) ?? 0 })),
    codes: codeRows.map((c) => ({ id: c._id.toHexString(), type: c.type, status: c.status,
      createdAt: date(c.created_at), createdBy: c.created_by ?? null,
      redeemedAt: date(c.redeemed_at), redeemedBy: c.redeemed_by ?? null,
      revokedAt: date(c.revoked_at), revokedBy: c.revoked_by ?? null })),
  };
}
