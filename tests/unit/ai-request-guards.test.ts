import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rate: vi.fn(), quota: vi.fn(), generate: vi.fn(), image: vi.fn() }));
vi.mock("@/lib/api-auth", () => ({ requireApiAuth: mocks.auth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: mocks.rate }));
vi.mock("@/lib/billing/quota", () => ({ reserveQuota: mocks.quota }));
vi.mock("@/lib/ai/generate", () => ({ generateKsp: mocks.generate }));
vi.mock("@/lib/ai/image", () => ({ generateImage: mocks.image }));
vi.mock("@/lib/rag/retrieve", () => ({ retrieveTextbookContext: vi.fn() }));
import { POST as generate } from "@/app/api/ai/generate/route";
import { POST as image } from "@/app/api/ai/image/route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "a".repeat(24), email: "teacher@example.test" } });
  mocks.rate.mockResolvedValue({ ok: true, resetAt: Date.now() + 60000 });
  mocks.quota.mockImplementation(() => { throw new Error("Quota must not be reserved"); });
  mocks.generate.mockImplementation(() => { throw new Error("External call forbidden"); });
  mocks.image.mockImplementation(() => { throw new Error("External call forbidden"); });
});

describe.each([["generate", generate], ["image", image]] as const)("%s request guards", (_name, handler) => {
  it.each(["{}", "invalid-json"])("rejects invalid input without reserving quota: %s", async (body) => {
    const response = await handler(new Request("http://localhost/api/test", { method: "POST", body }));
    expect(response.status).toBe(400);
    expect(mocks.quota).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.image).not.toHaveBeenCalled();
  });
  it("rejects rate-limited input before reserving quota", async () => {
    mocks.rate.mockResolvedValue({ ok: false, resetAt: Date.now() + 60000 });
    const response = await handler(new Request("http://localhost/api/test", { method: "POST", body: "{}" }));
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(mocks.quota).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.image).not.toHaveBeenCalled();
  });
  it("requires a session before rate limits or quota", async () => {
    mocks.auth.mockResolvedValue({ response: new Response(null, { status: 401 }) });
    const response = await handler(new Request("http://localhost/api/test", { method: "POST", body: "{}" }));
    expect(response.status).toBe(401);
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.quota).not.toHaveBeenCalled();
  });
});
