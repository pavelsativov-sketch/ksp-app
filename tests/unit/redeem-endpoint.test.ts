import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Интеграционные проверки страницы активации и связки с биллингом.
 * БД и auth замоканы: проверяем контракт эндпоинта и server action,
 * без реального Mongo/Atlas и без dev-сервера.
 */

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  auth: vi.fn(),
  getCurrentUser: vi.fn(),
  redeem: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/mongo", () => ({
  getDb: mocks.getDb,
  COL: { users: "users", billingCodes: "billing_codes", planEvents: "plan_events", aiEvents: "ai_events" },
  toObjectId: (s: string) => (/^[0-9a-f]{24}$/i.test(s) ? ({ toString: () => s } as never) : null),
  isMongoConfigured: () => true,
}));
vi.mock("@/lib/api-auth", () => ({ requireApiAuth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: mocks.checkRateLimit }));
vi.mock("@/lib/billing/redeem", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/billing/redeem")>();
  return { ...mod, redeemActivationCode: mocks.redeem };
});

import { POST as redeemRoute } from "@/app/api/billing/redeem/route";
import { redeemActivationCodeAction } from "@/app/actions/billing";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/billing/redeem", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/billing/redeem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue({ ok: true, remaining: 9, resetAt: Date.now() + 60_000 });
  });

  it("требует авторизацию: неавторизованный получает 401 без вызова активации", async () => {
    mocks.auth.mockResolvedValueOnce({ response: new Response(null, { status: 401 }) });
    const res = await redeemRoute(jsonRequest({ code: "X" }));
    expect(res.status).toBe(401);
    expect(mocks.redeem).not.toHaveBeenCalled();
  });

  it("некорректный JSON отклоняется как неверный код", async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: "a".repeat(24), email: "t@t.kz" } });
    mocks.redeem.mockResolvedValueOnce({ ok: false, error: "bad", status: 400 });
    const res = await redeemRoute(new Request("http://localhost/api/billing/redeem", { method: "POST", body: "not-json" }));
    expect(res.status).toBe(400);
    expect(mocks.redeem).toHaveBeenCalledWith("a".repeat(24), null);
  });

  it("успешная активация отдаёт plan=pro и дату окончания без кэша", async () => {
    mocks.auth.mockResolvedValueOnce({ user: { id: "a".repeat(24), email: "t@t.kz" } });
    const expiresAt = new Date("2027-01-01T00:00:00Z");
    mocks.redeem.mockResolvedValueOnce({ ok: true, plan: "pro", expiresAt });
    const res = await redeemRoute(jsonRequest({ code: "KSP-TEST-2026-ALPHA" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, plan: "pro" });
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });
});

describe("redeemActivationCodeAction (server action)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRateLimit.mockResolvedValue({ ok: true, remaining: 9, resetAt: Date.now() + 60_000 });
  });

  it("неавторизованный — 401, код не проверяется", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    const result = await redeemActivationCodeAction("whatever");
    expect(result.ok).toBe(false);
    expect(mocks.redeem).not.toHaveBeenCalled();
  });

  it("авторизованный — вызов активации с id сессии", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce({ id: "b".repeat(24), email: "t@t.kz" });
    mocks.redeem.mockResolvedValueOnce({ ok: true, plan: "pro", expiresAt: new Date() });
    const result = await redeemActivationCodeAction("  ksp-test  ");
    expect(result.ok).toBe(true);
    expect(mocks.redeem).toHaveBeenCalledWith("b".repeat(24), "  ksp-test  ");
  });
});
