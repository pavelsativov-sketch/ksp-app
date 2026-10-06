import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { hashActivationCode, redeemActivationCode } from "@/lib/billing/redeem";

const mock = vi.hoisted(() => ({ getDb: vi.fn(), auth: vi.fn(), rate: vi.fn(), distributed: vi.fn() }));
vi.mock("@/lib/mongo", async (original) => ({ ...await original<typeof import("@/lib/mongo")>(), getDb: mock.getDb }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mock.auth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: mock.rate, isDistributedLimiterActive: mock.distributed }));
import { limitAdmin, requireAdmin } from "@/lib/admin/auth";
import { createAdminCode, revokeAdminCode } from "@/lib/admin/codes";
import { createAdminCodeAction, revokeAdminCodeAction } from "@/app/actions/admin";

const adminId = "abcdefabcdefabcdefabcdef";
const now = new Date("2026-09-17T10:00:00.000Z");
let codes: Array<Record<string, unknown>>;
let events: Array<Record<string, unknown>>;
let failEvents = false;
const endSession = vi.fn();
const failInsert = false;

beforeEach(() => {
  vi.clearAllMocks();
  codes = []; events = []; failEvents = false;
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("ADMIN_USER_IDS", adminId);
  mock.auth.mockResolvedValue({ id: adminId, email: "admin@example.invalid" });
  mock.distributed.mockResolvedValue(true);
  mock.rate.mockResolvedValue({ ok: true, remaining: 19, resetAt: now.getTime() + 3600_000 });
  mock.getDb.mockResolvedValue({
    client: { startSession: () => ({ endSession, withTransaction: async (callback: () => Promise<unknown>) => {
      const oldCodes = codes.map((code) => ({ ...code })); const oldEvents = [...events];
      try { return await callback(); } catch (error) {
        codes = oldCodes; events = oldEvents;
        throw error;
      }
    } }) },
    collection: (name: string) => {
      if (name === "billing_codes") return {
        insertOne: async (doc: Record<string, unknown>) => { if (failInsert) throw new Error("insert failed"); codes.push({ ...doc }); },
        findOneAndUpdate: async (filter: { _id: ObjectId; status: string }, update: { $set: Record<string, unknown> }) => {
          const found = codes.find((c) => String(c._id) === filter._id.toString() && c.status === filter.status);
          if (!found) return null;
          Object.assign(found, update.$set);
          return { _id: found._id, type: found.type };
        },
      };
      if (name === "plan_events") return { insertOne: async (entry: Record<string, unknown>) => {
        if (failEvents) throw new Error("write failed");
        events.push(entry);
      } };
      throw new Error(`Unexpected collection ${name}`);
    },
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("admin code creation", () => {
  it("stores only a hash, audits the creation, and returns the plaintext once", async () => {
    const result = await createAdminCode({ type: "pro_1m" });
    expect(typeof result.plaintext).toBe("string");
    const code = codes[0];
    expect(code.status).toBe("active");
    expect(code.created_by).toBe(adminId);
    expect(code.codeHash).toBe(hashActivationCode(result.plaintext));
    expect(result.plaintext).toMatch(/^MEKTY-[a-f0-9]{64}$/);
    expect(JSON.stringify(codes)).not.toContain(result.plaintext);
    expect(JSON.stringify(events)).not.toContain(result.plaintext);
    expect(JSON.stringify(events)).not.toContain(String(code.codeHash));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event: "activation_code_created", actor_id: adminId, code_type: "pro_1m" });
    expect(String(events[0].code_id)).toBe(String(code._id));
    expect(endSession).toHaveBeenCalledOnce();
    expect(mock.rate).toHaveBeenCalledWith(`admin:create:${adminId}`, 20, 3600_000);
  });

  it("rejects invalid type or unauthorized caller without touching the database", async () => {
    await expect(createAdminCode({ type: "free_forever" })).rejects.toMatchObject({ status: 400 });
    await expect(createAdminCode({ type: "pro_1m", note: "extra" })).rejects.toMatchObject({ status: 400 });
    vi.stubEnv("ADMIN_USER_IDS", "111111111111111111111111");
    await expect(createAdminCode({ type: "pro_1m" })).rejects.toMatchObject({ status: 403 });
    expect(mock.getDb).not.toHaveBeenCalled();
    expect(codes).toHaveLength(0);
  });

  it("does not expose the plaintext when the audit write fails (rollback)", async () => {
    failEvents = true;
    const weakResult = await createAdminCodeAction({ type: "pro_1y" });
    expect(weakResult.ok).toBe(false);
    expect(weakResult).not.toHaveProperty("plaintext");
    expect(codes).toHaveLength(0);
    expect(events).toHaveLength(0);
  });
});

describe("admin code revocation", () => {
  it("revoked codes cannot be redeemed through the existing redemption flow", async () => {
    const claim = vi.fn().mockResolvedValue(null);
    mock.getDb.mockResolvedValue({
      client: { startSession: () => ({ endSession, withTransaction: (cb: () => Promise<unknown>) => cb() }) },
      collection: (name: string) => name === "users" ? { findOne: async () => ({ _id: new ObjectId(adminId) }) } : { findOneAndUpdate: claim },
    });
    expect(await redeemActivationCode(adminId, "revoked-example")).toMatchObject({ ok: false, status: 400 });
    expect(claim).toHaveBeenCalledWith(expect.objectContaining({ status: "active" }), expect.any(Object), expect.any(Object));
  });

  it("revokes only active codes and audits the change", async () => {
    const id = new ObjectId();
    codes.push({ _id: id, codeHash: "hash", type: "pro_1m", status: "active", redeemed_by: null, redeemed_at: null, created_at: now });
    await revokeAdminCode({ id: id.toHexString() });
    expect(codes[0]).toMatchObject({ status: "revoked", revoked_by: adminId });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event: "activation_code_revoked", actor_id: adminId });
  });

  it("returns 409 for redeemed, revoked, or unknown codes and writes no audit", async () => {
    const id = new ObjectId();
    codes.push({ _id: id, codeHash: "hash", type: "pro_1m", status: "redeemed", created_at: now });
    await expect(revokeAdminCode({ id: id.toHexString() })).rejects.toMatchObject({ status: 409 });
    expect(events).toHaveLength(0);
    await expect(revokeAdminCode({ id: "not-an-id" })).rejects.toMatchObject({ status: 400 });
  });

  it("rolls back a revoked status when the audit write fails", async () => {
    const id = new ObjectId();
    codes.push({ _id: id, codeHash: "hash", type: "pro_1y", status: "active", created_at: now });
    failEvents = true;
    await expect(revokeAdminCode({ id: id.toHexString() })).rejects.toBeInstanceOf(Error);
    expect(codes[0].status).toBe("active");
    expect(codes[0].revoked_by).toBeUndefined();
  });
});

describe("admin action wrappers", () => {
  it("rechecks session for both direct action calls", async () => {
    mock.auth.mockResolvedValue(null);
    expect(await createAdminCodeAction({ type: "pro_1m" })).toMatchObject({ ok: false, status: 401 });
    expect(await revokeAdminCodeAction({ id: new ObjectId().toHexString() })).toMatchObject({ ok: false, status: 401 });
    expect(mock.getDb).not.toHaveBeenCalled();
    expect(mock.rate).not.toHaveBeenCalled();
  });

  it("blocks both mutations when rate limited before database writes", async () => {
    mock.rate.mockResolvedValue({ ok: false, resetAt: now.getTime() + 60000 });
    expect(await createAdminCodeAction({ type: "pro_1m" })).toMatchObject({ status: 429 });
    expect(await revokeAdminCodeAction({ id: new ObjectId().toHexString() })).toMatchObject({ status: 429 });
    expect(mock.getDb).not.toHaveBeenCalled();
  });

  it("maps AdminError to a sanitized failure and hides storage errors", async () => {
    vi.stubEnv("ADMIN_USER_IDS", "111111111111111111111111");
    const denied = await createAdminCodeAction({ type: "pro_1m" });
    expect(denied).toEqual({ ok: false, error: "Доступ запрещён.", status: 403 });
    vi.stubEnv("ADMIN_USER_IDS", adminId);
    mock.getDb.mockRejectedValue(new Error("E11000 duplicate codeHash leak"));
    const hidden = await createAdminCodeAction({ type: "pro_1m" });
    expect(hidden).toEqual({ ok: false, error: "Операция временно недоступна. Обновите список перед повтором.", status: 503 });
    expect(JSON.stringify(hidden)).not.toContain("E11000");
  });

  it("exposes retryAfter from the rate limiter", async () => {
    mock.rate.mockResolvedValue({ ok: false, resetAt: now.getTime() + 45_000 });
    await expect(limitAdmin(adminId, "create")).rejects.toMatchObject({ status: 429, retryAfter: 45 });
    expect(await requireAdmin()).toMatchObject({ id: adminId });
  });
});
