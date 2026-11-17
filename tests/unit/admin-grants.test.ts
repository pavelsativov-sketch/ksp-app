import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const mock = vi.hoisted(() => ({ getDb: vi.fn(), auth: vi.fn(), rate: vi.fn(), distributed: vi.fn() }));
vi.mock("@/lib/mongo", async (original) => ({ ...await original<typeof import("@/lib/mongo")>(), getDb: mock.getDb }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mock.auth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: mock.rate, isDistributedLimiterActive: mock.distributed }));
import { grantBonusGenerations, setSubscription } from "@/lib/admin/grants";
import { POST as tokensPost } from "@/app/api/admin/users/[id]/tokens/route";
import { POST as subscriptionPost } from "@/app/api/admin/users/[id]/subscription/route";
import { GET as usersGet } from "@/app/api/admin/users/route";

const adminId = "abcdefabcdefabcdefabcdef";
const userId = "111111111111111111111111";
const now = new Date("2026-11-17T10:00:00.000Z");
let user: Record<string, unknown> | null;
let audit: Array<Record<string, unknown>>;
let planEvents: Array<Record<string, unknown>>;

/** Мини-интерпретатор выражений пайплайн-обновления, которые использует grants.ts. */
function evaluate(expr: unknown, doc: Record<string, unknown>): unknown {
  if (typeof expr === "string" && expr.startsWith("$")) {
    return expr.slice(1).split(".").reduce<unknown>((value, key) => (value as Record<string, unknown> | null | undefined)?.[key], doc);
  }
  if (Array.isArray(expr) || expr === null || typeof expr !== "object") return expr;
  const [op, arg] = Object.entries(expr)[0] as [string, unknown[]];
  const args = Array.isArray(arg) ? arg.map((a) => evaluate(a, doc)) : [];
  if (op === "$max") return Math.max(...(args as number[]));
  if (op === "$add") return (args as number[]).reduce((a, b) => a + b, 0);
  if (op === "$ifNull") return args[0] ?? args[1];
  if (op === "$eq") return args[0] === args[1];
  if (op === "$cond") return evaluate(args[0] ? arg[1] : arg[2], doc);
  return Object.fromEntries(Object.entries(expr).map(([k, v]) => [k, evaluate(v, doc)]));
}

const request = (body: unknown, origin = "http://localhost:3000") => new Request(`http://localhost:3000/api/admin/users/${userId}/x`, {
  method: "POST", headers: { "content-type": "application/json", host: "localhost:3000", origin }, body: JSON.stringify(body),
});
const ctx = { params: Promise.resolve({ id: userId }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("ADMIN_USER_IDS", adminId);
  user = { _id: new ObjectId(userId), plan: "free" };
  audit = []; planEvents = [];
  mock.auth.mockResolvedValue({ id: adminId, email: "admin@example.invalid" });
  mock.distributed.mockResolvedValue(true);
  mock.rate.mockResolvedValue({ ok: true, remaining: 10, resetAt: now.getTime() + 3600_000 });
  mock.getDb.mockResolvedValue({
    client: { startSession: () => ({ endSession: vi.fn(), withTransaction: (work: () => Promise<unknown>) => work() }) },
    collection: (name: string) => {
      if (name === "users") return {
        findOne: async () => user && { ...user },
        findOneAndUpdate: async (_filter: unknown, pipeline: Array<{ $set: Record<string, unknown> }>) => {
          if (!user) return null;
          for (const stage of pipeline) {
            const current: Record<string, unknown> = user;
            const next: Record<string, unknown> = { ...current };
            for (const [key, value] of Object.entries(stage.$set)) next[key] = evaluate(value, current);
            user = next;
          }
          return { ...user };
        },
        updateOne: async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
          user = { ...user, ...update.$set };
          return { matchedCount: 1 };
        },
      };
      if (name === "admin_actions") return { insertOne: async (doc: Record<string, unknown>) => { audit.push(doc); } };
      if (name === "plan_events") return { insertOne: async (doc: Record<string, unknown>) => { planEvents.push(doc); } };
      throw new Error(`Unexpected collection ${name}`);
    },
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("grantBonusGenerations", () => {
  it("adds a current-month bonus, accumulates it, and writes an audit record", async () => {
    expect(await grantBonusGenerations(userId, { amount: 5, scope: "month" })).toEqual({ permanent: 0, thisMonth: 5 });
    expect(await grantBonusGenerations(userId, { amount: 2, scope: "month" })).toEqual({ permanent: 0, thisMonth: 7 });
    expect(user?.bonus_generations_month).toEqual({ month: "2026-11", count: 7 });
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({ admin_id: adminId, target_user_id: userId, action: "grant_tokens", payload: { amount: 5, scope: "month" }, at: now });
  });

  it("resets a stale month instead of adding to it and clamps negatives at zero", async () => {
    user = { ...user, bonus_generations_month: { month: "2026-10", count: 50 }, bonus_generations: 3 };
    expect(await grantBonusGenerations(userId, { amount: 4, scope: "month" })).toMatchObject({ thisMonth: 4 });
    expect(await grantBonusGenerations(userId, { amount: -10, scope: "permanent" })).toMatchObject({ permanent: 0 });
  });

  it("rejects invalid amounts without writing", async () => {
    for (const body of [{ amount: 0, scope: "month" }, { amount: 1.5, scope: "month" }, { amount: 5000, scope: "month" }, { amount: 1, scope: "forever" }, { amount: 1, scope: "month", admin: true }]) {
      await expect(grantBonusGenerations(userId, body)).rejects.toMatchObject({ status: 400 });
    }
    expect(audit).toHaveLength(0);
  });
});

describe("setSubscription", () => {
  it("grants Pro for N months from now and audits it with plan_events", async () => {
    const result = await setSubscription(userId, { action: "extend", plan: "pro", months: 3 });
    expect(result).toEqual({ plan: "pro", expiresAt: "2027-02-17T10:00:00.000Z" });
    expect(user).toMatchObject({ plan: "pro", plan_expires_at: new Date("2027-02-17T10:00:00.000Z") });
    expect(planEvents[0]).toMatchObject({ event: "admin_subscription_set", user_id: userId, actor_id: adminId, previous_plan: "free" });
    expect(audit[0]).toMatchObject({ action: "set_subscription", target_user_id: userId, payload: { action: "extend", months: 3 } });
  });

  it("extends from an active expiry and supports an explicit end date", async () => {
    user = { ...user, plan: "pro", plan_expires_at: new Date("2026-12-01T00:00:00.000Z") };
    expect((await setSubscription(userId, { action: "extend", plan: "pro", months: 1 })).expiresAt).toBe("2027-01-01T00:00:00.000Z");
    expect((await setSubscription(userId, { action: "until", plan: "pro", until: "2027-06-30" })).expiresAt).toBe("2027-06-30T23:59:59.999Z");
    await expect(setSubscription(userId, { action: "until", plan: "pro", until: "2026-01-01" })).rejects.toMatchObject({ status: 400 });
  });

  it("revokes to Free and records the previous state", async () => {
    user = { ...user, plan: "pro", plan_expires_at: new Date("2027-01-01T00:00:00.000Z") };
    expect(await setSubscription(userId, { action: "revoke" })).toEqual({ plan: "free", expiresAt: null });
    expect(user).toMatchObject({ plan: "free", plan_expires_at: null });
    expect(planEvents[0]).toMatchObject({ event: "admin_subscription_revoked", previous_plan: "pro" });
    expect(audit[0]).toMatchObject({ payload: { action: "revoke", previous_plan: "pro" } });
  });

  it("rejects unknown tiers and durations", async () => {
    await expect(setSubscription(userId, { action: "extend", plan: "gold", months: 1 })).rejects.toMatchObject({ status: 400 });
    await expect(setSubscription(userId, { action: "extend", plan: "pro", months: 2 })).rejects.toMatchObject({ status: 400 });
  });

  it("returns 404 for an unknown user", async () => {
    user = null;
    await expect(setSubscription(userId, { action: "revoke" })).rejects.toMatchObject({ status: 404 });
  });
});

describe("admin API routes", () => {
  it("applies an admin grant and returns JSON", async () => {
    const response = await tokensPost(request({ amount: 3, scope: "permanent" }), ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { permanent: 3, thisMonth: 0 } });
  });

  it("hides the API from non-admins with 404 and writes nothing", async () => {
    mock.auth.mockResolvedValue({ id: userId, email: "user@example.invalid", role: "admin" });
    const response = await subscriptionPost(request({ action: "extend", plan: "pro", months: 12 }), ctx);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: "Не найдено." });
    expect((await usersGet(new Request("http://localhost:3000/api/admin/users"))).status).toBe(404);
    expect(user).toMatchObject({ plan: "free" });
    expect(audit).toHaveLength(0);
  });

  it("hides the API from guests and rejects cross-origin writes", async () => {
    mock.auth.mockResolvedValue(null);
    expect((await tokensPost(request({ amount: 1, scope: "month" }), ctx)).status).toBe(404);
    mock.auth.mockResolvedValue({ id: adminId, email: "admin@example.invalid" });
    expect((await tokensPost(request({ amount: 1, scope: "month" }, "https://evil.example"), ctx)).status).toBe(404);
    expect(audit).toHaveLength(0);
  });

  it("returns a Russian validation error and Retry-After when rate-limited", async () => {
    const bad = await tokensPost(request({ amount: "lots", scope: "month" }), ctx);
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/целое число/);
    mock.rate.mockResolvedValue({ ok: false, remaining: 0, resetAt: now.getTime() + 60_000 });
    const limited = await tokensPost(request({ amount: 1, scope: "month" }), ctx);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
  });
});
