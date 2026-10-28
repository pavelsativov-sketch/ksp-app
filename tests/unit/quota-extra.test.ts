import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

/**
 * Квота: структурированный отказ, HTTP-обёртка и невалидный пользователь.
 * Базовый путь покрыт billing.test.ts — здесь границы и вспомогательные функции.
 */

const mock = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/lib/mongo", async (original) => ({
  ...(await original<typeof import("@/lib/mongo")>()),
  getDb: mock.getDb,
}));

import { getPlanForUser, quotaFailure, reserveQuota, reserveQuotaOrResponse, utcMonthWindow } from "@/lib/billing/quota";
import type { UserPlanUsage } from "@/lib/billing/quota";

const userId = "111111111111111111111111";
const now = new Date("2026-09-17T12:30:00.000Z");
let user: Record<string, unknown> | null;
let events: Array<Record<string, unknown>>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  user = { _id: new ObjectId(userId) };
  events = [];
  mock.getDb.mockResolvedValue({
    collection: (name: string) => {
      if (name === "users") return { findOne: async () => user };
      if (name === "ai_events") return {
        insertOne: async (entry: Record<string, unknown>) => {
          if (typeof entry.seq === "number" && events.some((e) =>
            e.user_id === entry.user_id && e.task === entry.task &&
            (e as { seq?: number }).seq === (entry as { seq?: number }).seq &&
            (e as { month?: string }).month === (entry as { month?: string }).month)) {
            const dup = new Error("E11000 duplicate key");
            (dup as { code?: number }).code = 11000;
            throw dup;
          }
          events.push(entry);
        },
        deleteOne: async () => ({ deletedCount: 0 }),
        countDocuments: async (filter: { user_id: string; task: string; createdAt: { $gte: Date; $lt: Date } }) =>
          events.filter((e) => e.user_id === filter.user_id && e.task === filter.task &&
            (e.createdAt as Date) >= filter.createdAt.$gte && (e.createdAt as Date) < filter.createdAt.$lt).length,
        aggregate: (pipeline: Array<Record<string, unknown>>) => ({
          toArray: async () => {
            let rows: Array<Record<string, unknown>> = [...events];
            for (const stage of pipeline) {
              const match = stage.$match as Record<string, unknown> | undefined;
              if (match) {
                rows = rows.filter((e) => {
                  if (match.user_id && e.user_id !== match.user_id) return false;
                  if (match.task && e.task !== match.task) return false;
                  if (match.kind && e.kind !== match.kind) return false;
                  const createdAt = match.createdAt as { $gte?: Date; $lt?: Date } | undefined;
                  if (createdAt?.$gte && (e.createdAt as Date) < createdAt.$gte) return false;
                  if (createdAt?.$lt && (e.createdAt as Date) >= createdAt.$lt) return false;
                  return true;
                });
              }
              const group = stage.$group as { _id: string } | undefined;
              if (group) {
                const keyPath = String(group._id).replace(/^\$/, "");
                const byKey = new Map<string, number>();
                for (const e of rows) {
                  const key = String((e as Record<string, unknown>)[keyPath]);
                  byKey.set(key, (byKey.get(key) ?? 0) + 1);
                }
                rows = Array.from(byKey, ([_id, count]) => ({ _id, count }));
              }
            }
            return rows;
          },
        }),
      };
      throw new Error(`Unexpected collection ${name}`);
    },
  });
});
afterEach(() => vi.useRealTimers());

describe("quotaFailure", () => {
  const usage: UserPlanUsage = {
    plan: "free",
    limits: { kspPerMonth: 3, assistPerMonth: 30, handoutsWatermark: true, ktp: false, textbooks: 0, images: 0 },
    expiresAt: null,
    kspUsedThisMonth: 3,
    kspRemaining: 0,
    assistUsedThisMonth: 0,
    assistRemaining: 30,
    imagesUsedThisMonth: 0,
    imagesRemaining: 0,
  };

  it("returns status, code, message and usage for a generation overflow", () => {
    const failure = { ok: false as const, status: 429, code: "KSP_QUOTA_EXCEEDED", message: "Лимит исчерпан", usage };
    const { status, body } = quotaFailure(failure);
    expect(status).toBe(429);
    expect(body).toMatchObject({ error: "Лимит исчерпан", code: "KSP_QUOTA_EXCEEDED", plan: "free", kspRemaining: 0 });
  });

  it("returns 402 for an image overflow", () => {
    const failure = { ok: false as const, status: 402, code: "IMAGE_QUOTA_EXCEEDED", message: "Лимит изображений", usage };
    expect(quotaFailure(failure).status).toBe(402);
  });

  it("returns 503 without usage when the storage is unavailable", () => {
    const failure = { ok: false as const, status: 503, code: "QUOTA_UNAVAILABLE", message: "Проверка квоты временно недоступна.", usage: null };
    const { status, body } = quotaFailure(failure);
    expect(status).toBe(503);
    expect(body).not.toHaveProperty("plan");
  });
});

describe("reserveQuotaOrResponse", () => {
  it("returns a reservation on success", async () => {
    const result = await reserveQuotaOrResponse({ id: userId }, "generation");
    expect(result.ok).toBe(true);
  });

  it("returns a NextResponse with the failure body on quota overflow", async () => {
    // Заполняем лимит Free (3 генерации).
    for (let i = 0; i < 3; i++) {
      const r = await reserveQuota({ id: userId }, "generation");
      if (r.ok) await r.reservation.finalize(true);
    }
    const result = await reserveQuotaOrResponse({ id: userId }, "generation");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(429);
      const body = await result.response.json();
      expect(body).toMatchObject({ code: "KSP_QUOTA_EXCEEDED" });
    }
  });
});

describe("reserveQuota: невалидный пользователь", () => {
  it("fails closed for a malformed user id", async () => {
    const result = await reserveQuota({ id: "bad" }, "generation");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(503);
  });

  it("fails closed when the user is not found", async () => {
    user = null;
    const result = await reserveQuota({ id: userId }, "generation");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(503);
  });

  it("fails closed when the user collection throws", async () => {
    mock.getDb.mockRejectedValue(new Error("offline"));
    const result = await reserveQuota({ id: userId }, "generation");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(503);
      expect(result.code).toBe("QUOTA_UNAVAILABLE");
    }
  });
});

describe("getPlanForUser: невалидный пользователь", () => {
  it("throws for a malformed user id", async () => {
    await expect(getPlanForUser("bad")).rejects.toThrow("Invalid billing user");
  });

  it("throws when the user is not found", async () => {
    user = null;
    await expect(getPlanForUser(userId)).rejects.toThrow("Billing user not found");
  });
});

describe("utcMonthWindow", () => {
  it("returns the first and last millisecond of the UTC month", () => {
    expect(utcMonthWindow(new Date("2026-09-17T12:30:00.000Z"))).toEqual({
      start: new Date("2026-09-01T00:00:00.000Z"),
      end: new Date("2026-10-01T00:00:00.000Z"),
    });
  });

  it("handles December → January rollover", () => {
    expect(utcMonthWindow(new Date("2026-12-31T23:59:59.999Z"))).toEqual({
      start: new Date("2026-12-01T00:00:00.000Z"),
      end: new Date("2027-01-01T00:00:00.000Z"),
    });
  });
});
