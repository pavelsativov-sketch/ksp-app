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

import { getPlanForUser, quotaFailure, reserveQuota, reserveQuotaOrResponse, STALE_PENDING_MS, utcMonthWindow } from "@/lib/billing/quota";
import type { UserPlanUsage } from "@/lib/billing/quota";
import { aiEventsCollection } from "../helpers/ai-events-mock";

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
      if (name === "ai_events") return aiEventsCollection(() => events);
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

describe("admin bonus generations", () => {
  it("raises the Free monthly KSP limit by permanent and current-month bonuses", async () => {
    user = { _id: new ObjectId(userId), bonus_generations: 1, bonus_generations_month: { month: "2026-09", count: 2 } };
    expect((await getPlanForUser(userId)).limits.kspPerMonth).toBe(6);
    for (let i = 0; i < 6; i++) expect((await reserveQuota({ id: userId }, "generation")).ok).toBe(true);
    expect(await reserveQuota({ id: userId }, "generation")).toMatchObject({ ok: false, code: "KSP_QUOTA_EXCEEDED" });
  });

  it("ignores a bonus granted for another month", async () => {
    user = { _id: new ObjectId(userId), bonus_generations_month: { month: "2026-08", count: 10 } };
    expect((await getPlanForUser(userId)).limits.kspPerMonth).toBe(3);
  });
});

describe("незавершённые слоты (функцию убили до finalize)", () => {
  const reserveOk = async () => {
    const r = await reserveQuota({ id: userId }, "generation");
    if (!r.ok) throw new Error("expected reservation");
    return r.reservation;
  };

  it("слот резервируется pending, finalize(true) его подтверждает", async () => {
    const reservation = await reserveOk();
    expect(events[0]).toMatchObject({ kind: "slot", pending: true });
    await reservation.finalize(true);
    expect(events[0]).not.toHaveProperty("pending");
  });

  it("finalize идемпотентен: поздний finalize(false) не возвращает выданный слот", async () => {
    const reservation = await reserveOk();
    await reservation.finalize(true);
    await reservation.finalize(false);
    expect(events).toHaveLength(1);
  });

  it("брошенный pending-слот перестаёт считаться через STALE_PENDING_MS и освобождается при резерве", async () => {
    for (let i = 0; i < 3; i++) await reserveOk(); // три генерации «убиты» платформой
    expect(await reserveQuota({ id: userId }, "generation")).toMatchObject({ ok: false, code: "KSP_QUOTA_EXCEEDED" });
    vi.setSystemTime(new Date(now.getTime() + STALE_PENDING_MS - 1));
    expect((await getPlanForUser(userId)).kspUsedThisMonth).toBe(3);
    vi.setSystemTime(new Date(now.getTime() + STALE_PENDING_MS + 1));
    expect((await getPlanForUser(userId)).kspUsedThisMonth).toBe(0);
    const fresh = await reserveOk();
    await fresh.finalize(true);
    // Брошенные слоты удалены, их номера заняты заново без конфликта индекса.
    expect(events.filter((e) => e.kind === "slot")).toHaveLength(1);
  });

  it("Pro без лимита: повторный finalize(true) не пишет второй учёт", async () => {
    user = { _id: new ObjectId(userId), plan: "pro" };
    const reservation = await reserveOk();
    expect(reservation.remaining).toBeNull();
    await reservation.finalize(true);
    await reservation.finalize(true);
    expect(events).toHaveLength(1);
  });

  it("подтверждённые слоты со временем не освобождаются", async () => {
    for (let i = 0; i < 3; i++) await (await reserveOk()).finalize(true);
    vi.setSystemTime(new Date(now.getTime() + STALE_PENDING_MS * 3));
    expect(await reserveQuota({ id: userId }, "generation")).toMatchObject({ ok: false });
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
