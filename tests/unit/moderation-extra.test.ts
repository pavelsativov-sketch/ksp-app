import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

/**
 * Модерация: отказы по rate-limit, невалидный ввод, скрытый план и
 * жалоба на несуществующий план. Базовый путь покрыт moderation.test.ts.
 */

const mock = vi.hoisted(() => ({
  getDb: vi.fn(),
  auth: vi.fn(),
  rate: vi.fn(),
  plan: vi.fn(),
}));
vi.mock("@/lib/mongo", async (original) => ({ ...(await original<typeof import("@/lib/mongo")>()), getDb: mock.getDb }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mock.auth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: mock.rate, isDistributedLimiterActive: async () => true }));
vi.mock("@/lib/plans-repo", () => ({ getPlanById: mock.plan }));

import { reportPlan } from "@/lib/moderation";

const userId = "b".repeat(24);
const planId = "c".repeat(24);

let reports: Array<Record<string, unknown>>;

beforeEach(() => {
  vi.clearAllMocks();
  reports = [];
  vi.stubEnv("ADMIN_USER_IDS", "a".repeat(24));
  mock.auth.mockResolvedValue({ id: userId, email: "teacher@example.invalid" });
  mock.rate.mockResolvedValue({ ok: true });
  mock.plan.mockResolvedValue({ id: planId, owner_id: "d".repeat(24), visibility: "public" as const, moderationHidden: false });
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
      };
      throw new Error(`Unexpected collection ${name}`);
    },
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("reportPlan: отказы", () => {
  it("rejects invalid input before touching the database", async () => {
    for (const input of [
      {},
      { planId: "bad", reason: "spam" },
      { planId, reason: "unknown-reason" },
      { planId, reason: "spam", details: "я".repeat(501) },
    ]) {
      const res = await reportPlan(input);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("Некорректные данные жалобы");
    }
    expect(mock.getDb).not.toHaveBeenCalled();
  });

  it("rejects when the rate limit is exceeded", async () => {
    mock.rate.mockResolvedValue({ ok: false, resetAt: Date.now() + 60_000 });
    const res = await reportPlan({ planId, reason: "spam" });
    expect(res).toEqual({ ok: false, error: "Слишком много жалоб. Попробуйте позже." });
    expect(mock.getDb).not.toHaveBeenCalled();
  });

  it("rejects a report on a hidden plan", async () => {
    mock.plan.mockResolvedValue({ id: planId, owner_id: "d".repeat(24), visibility: "public" as const, moderationHidden: true });
    const res = await reportPlan({ planId, reason: "spam" });
    expect(res).toEqual({ ok: false, error: "План недоступен для жалобы" });
  });

  it("rejects a report on a non-existent plan", async () => {
    mock.plan.mockResolvedValue(null);
    const res = await reportPlan({ planId, reason: "spam" });
    expect(res).toEqual({ ok: false, error: "План недоступен для жалобы" });
  });

  it("rejects a report on an unlisted plan", async () => {
    mock.plan.mockResolvedValue({ id: planId, owner_id: "d".repeat(24), visibility: "unlisted" as const, moderationHidden: false });
    const res = await reportPlan({ planId, reason: "spam" });
    expect(res).toEqual({ ok: false, error: "План недоступен для жалобы" });
  });

  it("stores details only when provided", async () => {
    expect(await reportPlan({ planId, reason: "spam" })).toEqual({ ok: true });
    expect(reports[0].details).toBeUndefined();
    expect(await reportPlan({ planId: "e".repeat(24), reason: "spam", details: "реклама" })).toEqual({ ok: true });
    expect(reports[1].details).toBe("реклама");
  });

  it("maps a database error to a generic message", async () => {
    mock.getDb.mockRejectedValue(new Error("connection lost"));
    const res = await reportPlan({ planId, reason: "spam" });
    expect(res).toEqual({ ok: false, error: "Не удалось отправить жалобу. Попробуйте позже." });
  });
});
