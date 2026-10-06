import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

/**
 * Активация кодов: невалидный пользователь, отсутствующий пользователь и
 * ошибка базы данных. Базовый путь покрыт billing.test.ts.
 */

const mock = vi.hoisted(() => ({ getDb: vi.fn(), rate: vi.fn() }));
vi.mock("@/lib/mongo", async (original) => ({
  ...(await original<typeof import("@/lib/mongo")>()),
  getDb: mock.getDb,
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: mock.rate }));

import { hashActivationCode, INVALID_CODE_MESSAGE, redeemActivationCode } from "@/lib/billing/redeem";

const userId = "111111111111111111111111";
const now = new Date("2026-09-17T12:30:00.000Z");
let user: Record<string, unknown> | null;
let codes: Array<Record<string, unknown>>;
const claim = vi.fn();
const endSession = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  user = { _id: new ObjectId(userId) };
  codes = [];
  mock.rate.mockResolvedValue({ ok: true, remaining: 9, resetAt: now.getTime() + 3600_000 });
  claim.mockImplementation(async (filter: { codeHash: string; status: string }, update: { $set: Record<string, unknown> }) => {
    const found = codes.find((c) => c.codeHash === filter.codeHash && c.status === filter.status);
    if (!found) return null;
    Object.assign(found, update.$set);
    return { ...found };
  });
  mock.getDb.mockResolvedValue({
    client: { startSession: () => ({
      endSession,
      withTransaction: async (callback: () => Promise<unknown>) => {
        const oldUser = user ? { ...user } : null;
        const oldCodes = codes.map((c) => ({ ...c }));
        try { return await callback(); } catch (error) {
          user = oldUser; codes = oldCodes;
          throw error;
        }
      },
    }) },
    collection: (name: string) => {
      if (name === "users") return {
        findOne: async () => user,
        updateOne: async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
          if (!user) return { matchedCount: 0 };
          Object.assign(user, update.$set);
          return { matchedCount: 1 };
        },
      };
      if (name === "billing_codes") return { findOneAndUpdate: claim };
      if (name === "plan_events") return { insertOne: async () => {} };
      throw new Error(`Unexpected collection ${name}`);
    },
  });
});
afterEach(() => vi.useRealTimers());

function addCode(code = "TEST-CODE", type: "pro_1y" | "pro_3m" | "pro_1m" = "pro_1m") {
  codes.push({ _id: new ObjectId(), codeHash: hashActivationCode(code), type, status: "active",
    redeemed_by: null, redeemed_at: null, created_at: now });
}

describe("redeemActivationCode: отказы", () => {
  it("rejects a malformed user id before reading codes", async () => {
    const res = await redeemActivationCode("bad", "code");
    expect(res).toEqual({ ok: false, error: "Требуется вход", status: 401 });
    expect(mock.getDb).not.toHaveBeenCalled();
  });

  it("rejects when the user is not found", async () => {
    user = null;
    addCode();
    const res = await redeemActivationCode(userId, "test-code");
    expect(res).toEqual({ ok: false, error: "Требуется вход", status: 401 });
  });

  it("rejects an empty code", async () => {
    const res = await redeemActivationCode(userId, "   ");
    expect(res).toEqual({ ok: false, error: INVALID_CODE_MESSAGE, status: 400 });
  });

  it("rejects a code longer than 256 characters", async () => {
    const res = await redeemActivationCode(userId, "я".repeat(257));
    expect(res).toEqual({ ok: false, error: INVALID_CODE_MESSAGE, status: 400 });
  });

  it("rejects a non-string code", async () => {
    const res = await redeemActivationCode(userId, 123);
    expect(res).toEqual({ ok: false, error: INVALID_CODE_MESSAGE, status: 400 });
  });

  it("returns 503 when the database is unavailable", async () => {
    mock.getDb.mockRejectedValue(new Error("offline"));
    addCode();
    const res = await redeemActivationCode(userId, "test-code");
    expect(res).toEqual({ ok: false, error: "Активация временно недоступна. Попробуйте позже.", status: 503 });
  });

  it("returns 503 when the user disappears mid-transaction", async () => {
    addCode();
    // Пользователь есть при чтении, но updateOne не находит его.
    mock.getDb.mockResolvedValue({
      client: { startSession: () => ({
        endSession,
        withTransaction: async (callback: () => Promise<unknown>) => {
          const oldCodes = codes.map((c) => ({ ...c }));
          try { return await callback(); } catch (error) {
            codes = oldCodes;
            throw error;
          }
        },
      }) },
      collection: (name: string) => {
        if (name === "users") return {
          findOne: async () => user,
          updateOne: async () => ({ matchedCount: 0 }),
        };
        if (name === "billing_codes") return { findOneAndUpdate: claim };
        if (name === "plan_events") return { insertOne: async () => {} };
        throw new Error(`Unexpected collection ${name}`);
      },
    });
    const res = await redeemActivationCode(userId, "test-code");
    expect(res).toMatchObject({ ok: false, status: 503 });
    expect(codes[0].status).toBe("active"); // откат транзакции
  });

  it("does not leak the code hash in the error message", async () => {
    addCode();
    mock.getDb.mockRejectedValue(new Error(`secret codeHash ${hashActivationCode("TEST-CODE")}`));
    const res = await redeemActivationCode(userId, "test-code");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).not.toContain(hashActivationCode("TEST-CODE"));
  });
});
