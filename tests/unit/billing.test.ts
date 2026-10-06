import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { BillingCodeDocument } from "@/lib/billing/redeem";
import type { UserBillingFields } from "@/lib/billing/plans";

const mock = vi.hoisted(() => ({
  getDb: vi.fn(), rate: vi.fn(), auth: vi.fn(), apiAuth: vi.fn(), revalidate: vi.fn(), img: vi.fn(),
}));
vi.mock("@/lib/mongo", async (original) => ({
  ...await original<typeof import("@/lib/mongo")>(), getDb: mock.getDb,
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: mock.rate }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mock.auth }));
vi.mock("@/lib/api-auth", () => ({ requireApiAuth: mock.apiAuth }));
vi.mock("@/lib/ai/image", () => ({ generateImage: mock.img }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));

import { PLANS } from "@/lib/billing/plans";
import { extendPlanExpiry, hashActivationCode, INVALID_CODE_MESSAGE, redeemActivationCode } from "@/lib/billing/redeem";
import { reserveQuota, getPlanForUser, utcMonthWindow } from "@/lib/billing/quota";
import { redeemActivationCodeAction } from "@/app/actions/billing";
import { POST } from "@/app/api/billing/redeem/route";
import { GET } from "@/app/api/billing/plan/route";
import { POST as imagePOST } from "@/app/api/ai/image/route";

const userId = "111111111111111111111111";
const now = new Date("2026-09-17T12:30:00.000Z");
let user: (UserBillingFields & { _id: ObjectId }) | null;
let codes: BillingCodeDocument[];
let events: Array<{ user_id: string; task: string; createdAt: Date }>;
let audit: Record<string, unknown>[];
let failAudit: boolean;
const claim = vi.fn();
const endSession = vi.fn();

function addCode(code = "TEST-CODE", type: BillingCodeDocument["type"] = "pro_1m") {
  codes.push({ _id: new ObjectId(), codeHash: hashActivationCode(code), type, status: "active",
    redeemed_by: null, redeemed_at: null, created_at: now });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  user = { _id: new ObjectId(userId) };
  codes = []; events = []; audit = []; failAudit = false;
  mock.rate.mockResolvedValue({ ok: true, remaining: 9, resetAt: now.getTime() + 3600_000 });
  mock.auth.mockResolvedValue({ id: userId });
  mock.apiAuth.mockResolvedValue({ user: { id: userId, email: "test@example.invalid" } });
  claim.mockImplementation(async (filter: { codeHash: string; status: string }, update: { $set: Partial<BillingCodeDocument> }) => {
    const found = codes.find((c) => c.codeHash === filter.codeHash && c.status === filter.status);
    if (!found) return null;
    Object.assign(found, update.$set);
    return { ...found };
  });
  mock.getDb.mockResolvedValue({
    client: { startSession: () => ({
      endSession,
      // Модель отката: тест не открывает соединение с MongoDB.
      withTransaction: async (callback: () => Promise<unknown>) => {
        const oldUser = user ? { ...user } : null;
        const oldCodes = codes.map((c) => ({ ...c }));
        const oldAudit = [...audit];
        try { return await callback(); } catch (error) {
          user = oldUser; codes = oldCodes; audit = oldAudit;
          throw error;
        }
      },
    }) },
    collection: (name: string) => {
      if (name === "users") return {
        findOne: async () => user,
        updateOne: async (_filter: unknown, update: { $set: UserBillingFields }) => {
          if (!user) return { matchedCount: 0 };
          Object.assign(user, update.$set);
          return { matchedCount: 1 };
        },
      };
      if (name === "billing_codes") return { findOneAndUpdate: claim };
      if (name === "plan_events") return { insertOne: async (entry: Record<string, unknown>) => {
        if (failAudit) throw new Error("write failed");
        audit.push(entry);
      } };
      if (name === "ai_events") return {
        insertOne: async (entry: typeof events[number] & { seq?: number }) => {
          // Уникальный частичный индекс слотов квоты: дубликат seq → ошибка 11000.
          if (typeof entry.seq === "number" && events.some((e) =>
            e.user_id === entry.user_id && e.task === entry.task &&
            (e as { seq?: number }).seq === entry.seq &&
            (e as { month?: string }).month === (entry as { month?: string }).month)) {
            const dup = new Error("E11000 duplicate key");
            (dup as { code?: number }).code = 11000;
            throw dup;
          }
          events.push(entry);
        },
        deleteOne: async (filter: { user_id: string; task: string; month?: string; seq?: number }) => {
          const idx = events.findIndex((e) => e.user_id === filter.user_id && e.task === filter.task &&
            (e as { seq?: number }).seq === filter.seq);
          if (idx >= 0) events.splice(idx, 1);
          return { deletedCount: idx >= 0 ? 1 : 0 };
        },
        countDocuments: async (filter: { user_id: string; task: string; createdAt: { $gte: Date; $lt: Date } }) =>
          events.filter((event) => event.user_id === filter.user_id && event.task === filter.task &&
            event.createdAt >= filter.createdAt.$gte && event.createdAt < filter.createdAt.$lt).length,
      };
      throw new Error(`Unexpected collection ${name}`);
    },
  });
});
afterEach(() => vi.useRealTimers());

describe("activation codes", () => {
  it("normalizes, atomically claims once, extends and audits", async () => {
    addCode();
    const result = await redeemActivationCode(userId, "  test-CoDe  ");
    expect(result).toEqual({ ok: true, plan: "pro", expiresAt: new Date("2026-10-17T12:30:00Z") });
    expect(user?.plan).toBe("pro");
    expect(codes[0]).toMatchObject({ status: "redeemed", redeemed_by: userId, redeemed_at: now });
    expect(claim).toHaveBeenCalledWith(expect.objectContaining({ status: "active", codeHash: hashActivationCode("TEST-CODE") }),
      expect.any(Object), expect.objectContaining({ returnDocument: "after", session: expect.any(Object) }));
    expect(audit).toHaveLength(1);
    expect(audit[0]).not.toHaveProperty("codeHash");
    expect(endSession).toHaveBeenCalledOnce();
    expect(mock.rate).toHaveBeenCalledWith(`billing:redeem:${userId}`, 10, 3600_000);
  });

  it("rejects reuse and unknown codes with exactly the same generic message", async () => {
    addCode();
    await redeemActivationCode(userId, "TEST-CODE");
    const reused = await redeemActivationCode(userId, "TEST-CODE");
    const unknown = await redeemActivationCode(userId, "missing");
    expect(reused).toEqual({ ok: false, status: 400, error: INVALID_CODE_MESSAGE });
    expect(unknown).toEqual(reused);
    expect(audit).toHaveLength(1);
    expect(user?.plan_expires_at).toEqual(new Date("2026-10-17T12:30:00Z"));
  });

  it("allows only one claim when the same code is submitted concurrently", async () => {
    addCode();
    const results = await Promise.all([
      redeemActivationCode(userId, "test-code"),
      redeemActivationCode(userId, "TEST-CODE"),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, status: 400, error: INVALID_CODE_MESSAGE },
    ]);
    expect(audit).toHaveLength(1);
  });

  it("extends a future expiry by a calendar year and stacks another code", async () => {
    user!.plan = "pro";
    user!.plan_expires_at = new Date("2027-01-31T08:00:00Z");
    addCode("YEAR", "pro_1y"); addCode("MONTH");
    await redeemActivationCode(userId, "year");
    expect(user?.plan_expires_at).toEqual(new Date("2028-01-31T08:00:00Z"));
    await redeemActivationCode(userId, "month");
    expect(user?.plan_expires_at).toEqual(new Date("2028-02-29T08:00:00Z"));
  });

  it("starts an expired plan from now and clamps leap-day anniversaries", async () => {
    user!.plan_expires_at = new Date("2025-01-01Z");
    addCode();
    await redeemActivationCode(userId, "test-code");
    expect(user?.plan_expires_at).toEqual(new Date("2026-10-17T12:30:00Z"));
    expect(extendPlanExpiry(new Date("2028-02-29T10:00:00Z"), "pro_1y"))
      .toEqual(new Date("2029-02-28T10:00:00Z"));
  });

  it("extends by a quarter for pro_3m codes", async () => {
    addCode("QUARTER", "pro_3m");
    await redeemActivationCode(userId, "quarter");
    expect(user?.plan).toBe("pro");
    expect(user?.plan_expires_at).toEqual(new Date("2026-12-17T12:30:00Z"));
    expect(extendPlanExpiry(new Date("2026-01-31T10:00:00Z"), "pro_3m"))
      .toEqual(new Date("2026-04-30T10:00:00Z"));
  });

  it("rolls back the claim and subscription when audit persistence fails", async () => {
    addCode(); failAudit = true;
    expect(await redeemActivationCode(userId, "test-code")).toMatchObject({ ok: false, status: 503 });
    expect(codes[0].status).toBe("active");
    expect(user?.plan).toBeUndefined();
    expect(audit).toHaveLength(0);
  });

  it("rate limits before reading codes and rejects invalid input", async () => {
    expect(await redeemActivationCode(userId, " ")).toMatchObject({ ok: false, status: 400 });
    mock.rate.mockResolvedValue({ ok: false, resetAt: now.getTime() + 60_000 });
    expect(await redeemActivationCode(userId, "code")).toMatchObject({ ok: false, status: 429, retryAfter: 60 });
    expect(mock.getDb).not.toHaveBeenCalled();
  });
});

describe("monthly quota", () => {
  it("exposes free defaults and Pro features as data", async () => {
    expect(await getPlanForUser(userId)).toMatchObject({ plan: "free", limits: {
      kspPerMonth: 3, handoutsWatermark: true, ktp: false, textbooks: 0, images: 0,
    }, expiresAt: null, kspUsedThisMonth: 0, kspRemaining: 3 });
    user!.plan = "pro"; user!.plan_expires_at = null;
    expect(await getPlanForUser(userId)).toMatchObject({ plan: "pro", limits: {
      kspPerMonth: null, handoutsWatermark: false, ktp: true, textbooks: 3, images: 50,
    }, kspRemaining: null });
    expect(PLANS.pro.kspFairUsePerMonth).toBe(60);
  });

  it("reserves quota slots atomically, releases on failure, and blocks over-limit requests", async () => {
    // Три успешных генерации занимают все слоты Free.
    const first = await reserveQuota({ id: userId }, "generation");
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.reservation.remaining).toBe(2);
    const second = await reserveQuota({ id: userId }, "generation");
    if (second.ok) await second.reservation.finalize(true);
    const third = await reserveQuota({ id: userId }, "generation");
    if (third.ok) await third.reservation.finalize(true);

    // Четвёртый запрос не получает слот — лимит исчерпан.
    const blocked = await reserveQuota({ id: userId }, "generation");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.status).toBe(429);

    // Ошибка генерации возвращает слот.
    if (first.ok) {
      await first.reservation.finalize(false);
      const again = await reserveQuota({ id: userId }, "generation");
      expect(again.ok).toBe(true);
      if (again.ok) expect(again.reservation.remaining).toBe(0);
    }
    expect((await getPlanForUser(userId)).kspUsedThisMonth).toBe(3);
  });

  it("holds each quota slot against concurrent requests", async () => {
    const results = await Promise.all([
      reserveQuota({ id: userId }, "generation"),
      reserveQuota({ id: userId }, "generation"),
      reserveQuota({ id: userId }, "generation"),
      reserveQuota({ id: userId }, "generation"),
      reserveQuota({ id: userId }, "generation"),
    ]);
    const granted = results.filter((r) => r.ok);
    const denied = results.filter((r) => !r.ok);
    expect(granted).toHaveLength(3);
    expect(denied).toHaveLength(2);
    for (const r of denied) {
      if (r.ok) continue;
      expect(r.status).toBe(429);
    }
    expect((await getPlanForUser(userId)).kspUsedThisMonth).toBe(3);
  });

  it("uses calendar UTC boundaries, user and task filters, and resets next month", async () => {
    events.push(...[
      { user_id: userId, task: "generation", createdAt: new Date("2026-08-31T23:59:59.999Z") },
      { user_id: userId, task: "generation", createdAt: new Date("2026-09-01T00:00:00Z") },
      { user_id: "other", task: "generation", createdAt: now },
      { user_id: userId, task: "image", createdAt: now },
      { user_id: userId, task: "generation", createdAt: new Date("2026-10-01T00:00:00Z") },
    ]);
    expect((await getPlanForUser(userId)).kspUsedThisMonth).toBe(1);
    expect(utcMonthWindow(new Date("2026-12-31T23:59:59Z"))).toEqual({
      start: new Date("2026-12-01Z"), end: new Date("2027-01-01Z"),
    });
    vi.setSystemTime(new Date("2026-11-01T00:00:00Z"));
    expect((await getPlanForUser(userId)).kspRemaining).toBe(3);
  });

  it("rolls Pro off exactly at expiry without losing monthly usage", async () => {
    user!.plan = "pro"; user!.plan_expires_at = new Date(now.getTime() + 1);
    const pro = await reserveQuota({ id: userId }, "generation");
    if (pro.ok) await pro.reservation.finalize(true);
    expect((await getPlanForUser(userId)).plan).toBe("pro");
    vi.setSystemTime(new Date(now.getTime() + 1));
    expect(await getPlanForUser(userId)).toMatchObject({ plan: "free", kspUsedThisMonth: 1, kspRemaining: 2 });
  });

  it("does not impose the Pro fair-use threshold as a hard cap", async () => {
    user!.plan = "pro";
    events.push(...Array.from({ length: 60 }, () => ({ user_id: userId, task: "generation", createdAt: now })));
    const result = await reserveQuota({ id: userId }, "generation");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.reservation.remaining).toBe(null);
  });

  it("fails closed when storage is unavailable", async () => {
    mock.getDb.mockRejectedValue(new Error("offline"));
    const result = await reserveQuota({ id: userId }, "generation");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(503);
  });

  // Регрессия: квота резервировалась только в /api/ai/generate, а улучшение
  // секций, генерация заданий и раздаточные материалы её обходили.
  it("assist quota is counted separately from ksp quota and enforced", async () => {
    const limit = PLANS.free.limits.assistPerMonth;
    expect(limit).not.toBeNull();
    for (let i = 0; i < limit!; i++) {
      const r = await reserveQuota({ id: userId }, "assist");
      if (r.ok) await r.reservation.finalize(true);
    }
    const blocked = await reserveQuota({ id: userId }, "assist");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.status).toBe(429);
      expect(blocked.code).toBe("ASSIST_QUOTA_EXCEEDED");
    }
    // Квота КСП при этом не тронута — улучшение секций не съедает лимит планов.
    const ksp = await reserveQuota({ id: userId }, "generation");
    expect(ksp.ok).toBe(true);
  });

  it("enforces the image plan limit on the image endpoint", async () => {
    const request = () => new Request("http://localhost/api/ai/image", {
      method: "POST",
      body: JSON.stringify({ prompt: "Пример иллюстрации урока" }),
    });

    // Free: 0 изображений — отказ ещё до обращения к провайдеру.
    const free = await imagePOST(request());
    expect(free.status).toBe(402);
    expect(await free.json()).toMatchObject({ code: "IMAGE_QUOTA_EXCEEDED" });
    expect(mock.img).not.toHaveBeenCalled();

    // Pro: лимит есть, учитывается по факту изображений за месяц.
    user!.plan = "pro";
    events.push(...Array.from({ length: 50 }, () => ({ user_id: userId, task: "image", createdAt: now })));
    const exhausted = await imagePOST(request());
    expect(exhausted.status).toBe(402);
    expect(mock.img).not.toHaveBeenCalled();

    mock.img.mockResolvedValue({ base64: "aGk=", mimeType: "image/jpeg", provider: "test" });
    events.pop(); // 49 использовано — последний запрос проходит и записывает 50-е изображение.
    const last = await imagePOST(request());
    expect(last.status).toBe(200);
    expect(mock.img).toHaveBeenCalledTimes(1);
    expect(events.filter((event) => event.task === "image")).toHaveLength(50);
  });
});

describe("billing entry points", () => {
  it("authenticates the server action and revalidates only on success", async () => {
    mock.auth.mockResolvedValueOnce(null);
    expect(await redeemActivationCodeAction("code")).toMatchObject({ ok: false, status: 401 });
    expect(mock.rate).not.toHaveBeenCalled();
    addCode();
    expect((await redeemActivationCodeAction("test-code")).ok).toBe(true);
    expect(mock.revalidate).toHaveBeenCalledWith("/", "layout");
  });

  it("serves private plan usage and validates redemption JSON", async () => {
    const plan = await GET();
    expect(plan.headers.get("Cache-Control")).toContain("no-store");
    expect(await plan.json()).toMatchObject({ plan: "free", kspRemaining: 3 });
    const invalid = await POST(new Request("http://localhost/api/billing/redeem", { method: "POST", body: "{" }));
    expect(invalid.status).toBe(400);
    expect(mock.rate).toHaveBeenCalledOnce();
    addCode();
    const response = await POST(new Request("http://localhost/api/billing/redeem", {
      method: "POST", body: JSON.stringify({ code: "test-code", userId: "other" }),
    }));
    expect(response.status).toBe(200);
    expect(codes[0].redeemed_by).toBe(userId);
  });

  it("rejects unauthenticated API requests", async () => {
    mock.apiAuth.mockResolvedValue({ response: new Response(null, { status: 401 }) });
    expect((await GET()).status).toBe(401);
    expect((await POST(new Request("http://localhost/api/billing/redeem", { method: "POST" }))).status).toBe(401);
    expect(mock.getDb).not.toHaveBeenCalled();
  });
});
