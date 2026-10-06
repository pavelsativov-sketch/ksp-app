import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { buildLibraryFilter } from "@/lib/library-query";

const mock = vi.hoisted(() => ({
  getDb: vi.fn(),
  auth: vi.fn(),
  rate: vi.fn(),
  plan: vi.fn(),
}));
vi.mock("@/lib/mongo", async (original) => ({ ...await original<typeof import("@/lib/mongo")>(), getDb: mock.getDb }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mock.auth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: mock.rate, isDistributedLimiterActive: async () => true }));
vi.mock("@/lib/plans-repo", () => ({ getPlanById: mock.plan }));

import { listModerationQueue, reportPlan, resolveReport, setPlanHidden } from "@/lib/moderation";

const adminId = "a".repeat(24);
const userId = "b".repeat(24);
const planId = "c".repeat(24);
const publicPlan = () => ({ id: planId, owner_id: "d".repeat(24), visibility: "public" as const, moderationHidden: false });

let reports: Array<Record<string, unknown>>;
let plans: Array<Record<string, unknown>>;
let events: Array<Record<string, unknown>>;

beforeEach(() => {
  vi.clearAllMocks();
  reports = []; plans = []; events = [];
  vi.stubEnv("ADMIN_USER_IDS", adminId);
  mock.auth.mockResolvedValue({ id: userId, email: "teacher@example.invalid" });
  mock.rate.mockResolvedValue({ ok: true });
  mock.plan.mockResolvedValue(publicPlan());
  mock.getDb.mockResolvedValue({
    collection: (name: string) => {
      if (name === "plan_reports") return {
        findOne: async (filter: Record<string, unknown>) =>
          reports.find((r) => Object.entries(filter).every(([k, v]) => r[k] === v)) ?? null,
        insertOne: async (doc: Record<string, unknown>) => {
          const saved = { ...doc, _id: new ObjectId() };
          reports.push(saved);
          return { insertedId: saved._id };
        },
        findOneAndUpdate: async (filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) => {
          const found = reports.find((r) => String(r._id) === String((filter._id as ObjectId)?.toString?.() ?? filter._id) && r.status === filter.status);
          if (!found) return null;
          Object.assign(found, update.$set);
          return found;
        },
        find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => reports.filter((r) => r.status === "open") }) }) }),
      };
      if (name === "lesson_plans") return {
        findOneAndUpdate: async (filter: { _id: ObjectId }, update: { $set?: Record<string, unknown>; $unset?: Record<string, unknown> }) => {
          const found = plans.find((p) => String(p._id) === filter._id.toString());
          if (!found) return null;
          Object.assign(found, update.$set);
          for (const k of Object.keys(update.$unset ?? {})) delete found[k];
          return { _id: found._id, owner_id: found.owner_id };
        },
        find: () => ({ project: () => ({ toArray: async () => plans }) }),
      };
      if (name === "users") return { find: () => ({ project: () => ({ toArray: async () => [] }) }) };
      if (name === "plan_events") return { insertOne: async (e: Record<string, unknown>) => { events.push(e); } };
      throw new Error(`Unexpected collection ${name}`);
    },
  });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("reportPlan", () => {
  it("requires login", async () => {
    mock.auth.mockResolvedValue(null);
    expect(await reportPlan({ planId, reason: "spam" })).toEqual({ ok: false, error: "Требуется вход" });
  });
  it("rejects own and non-public plans", async () => {
    mock.plan.mockResolvedValue({ ...publicPlan(), owner_id: userId });
    expect((await reportPlan({ planId, reason: "spam" })).ok).toBe(false);
    mock.plan.mockResolvedValue({ ...publicPlan(), visibility: "private" });
    expect((await reportPlan({ planId, reason: "spam" })).ok).toBe(false);
  });
  it("stores a report and blocks duplicates", async () => {
    expect(await reportPlan({ planId, reason: "spam", details: "реклама" })).toEqual({ ok: true });
    expect(reports).toHaveLength(1);
    expect(await reportPlan({ planId, reason: "spam" })).toEqual({
      ok: false, error: "Жалоба уже отправлена и ждёт рассмотрения",
    });
  });
});

describe("library filter", () => {
  it("excludes moderated plans", () => {
    const filter = buildLibraryFilter({ q: "", subject: "", grade: "", quarter: "", language: "", dateFrom: "", dateTo: "", sort: "newest", page: 1 }, []);
    expect(filter).toMatchObject({ visibility: "public", moderation_hidden: { $ne: true } });
  });
});

describe("admin moderation", () => {
  beforeEach(() => {
    mock.auth.mockResolvedValue({ id: adminId, email: "admin@example.invalid" });
    plans.push({ _id: new ObjectId(planId), title: "План", owner_id: "d".repeat(24) });
  });
  it("hides and unhides with audit", async () => {
    expect(await setPlanHidden({ planId }, true)).toEqual({ ok: true });
    expect(plans[0].moderation_hidden).toBe(true);
    expect(events.map((e) => e.event)).toEqual(["moderation_hide"]);
    expect(await setPlanHidden({ planId }, false)).toEqual({ ok: true });
    expect(plans[0].moderation_hidden).toBe(false);
  });
  it("resolves reports", async () => {
    reports.push({ _id: new ObjectId(), plan_id: planId, reporter_id: userId, reason: "spam", status: "open", created_at: new Date() });
    const id = String(reports[0]._id);
    expect(await resolveReport({ id })).toEqual({ ok: true });
    expect(reports[0].status).toBe("resolved");
  });
  it("lists the queue", async () => {
    reports.push({ _id: new ObjectId(), plan_id: planId, reporter_id: userId, reason: "spam", status: "open", created_at: new Date("2026-01-01") });
    const items = await listModerationQueue();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ planId, planTitle: "План", reason: "Спам или реклама" });
  });
  it("denies non-admins", async () => {
    mock.auth.mockResolvedValue({ id: userId, email: "teacher@example.invalid" });
    await expect(setPlanHidden({ planId }, true)).rejects.toMatchObject({ status: 403 });
  });
});
