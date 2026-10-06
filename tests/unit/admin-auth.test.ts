import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ auth: vi.fn(), rate: vi.fn(), distributed: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mock.auth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: mock.rate, isDistributedLimiterActive: mock.distributed }));
import { isAdminUserId, limitAdmin, requireAdmin } from "@/lib/admin/auth";
const id = "abcdefabcdefabcdefabcdef";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ADMIN_USER_IDS", id);
  mock.auth.mockResolvedValue({ id, email: "admin@example.invalid" });
  mock.distributed.mockResolvedValue(true);
  mock.rate.mockResolvedValue({ ok: true });
});
afterEach(() => vi.unstubAllEnvs());
describe("admin authorization", () => {
  it("allows only explicit existing session IDs, including normalized hex", async () => {
    vi.stubEnv("ADMIN_USER_IDS", ` ${id.toUpperCase()},111111111111111111111111 `);
    expect(isAdminUserId(id)).toBe(true);
    expect(await requireAdmin()).toMatchObject({ id });
  });
  it.each(["", "admin@example.invalid", `${id},bad`, `${id},`, "111111111111111111111111"])("fails closed for allowlist %s", async (value) => {
    vi.stubEnv("ADMIN_USER_IDS", value);
    await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
  });
  it("rejects absent/deleted sessions even for an allowlisted ID", async () => {
    mock.auth.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toMatchObject({ status: 401 });
  });
  it("does not elevate an email match or client-like role field", async () => {
    mock.auth.mockResolvedValue({ id: "111111111111111111111111", email: "admin@example.invalid", role: "admin" });
    await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
  });
  it("reuses per-admin operation rate limits", async () => {
    await limitAdmin(id, "create");
    expect(mock.rate).toHaveBeenCalledWith(`admin:create:${id}`, 20, 3600000);
    mock.rate.mockResolvedValue({ ok: false, resetAt: Date.now() + 60000 });
    await expect(limitAdmin(id, "revoke")).rejects.toMatchObject({ status: 429 });
  });
  it("blocks operations when distributed storage is unavailable", async () => {
    mock.distributed.mockResolvedValue(false);
    await expect(limitAdmin(id, "create")).rejects.toMatchObject({ status: 503 });
    expect(mock.rate).not.toHaveBeenCalled();
  });
});
