/** /api/health: публично только {ok}, подробности — админу или мониторингу с токеном. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ user: vi.fn() }));
vi.mock("@/lib/mongo", () => ({
  isMongoConfigured: () => true,
  getDb: async () => ({ command: async () => ({ ok: 1 }) }),
}));
vi.mock("@/lib/ai/providers", () => ({ isAnyProviderConfigured: () => true }));
vi.mock("@/lib/rate-limit", () => ({ getRateLimitFallbackStats: () => ({ fallbackTransitions: 0 }) }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mock.user }));

import { GET } from "@/app/api/health/route";

const ADMIN = "f".repeat(24);
const get = (headers: Record<string, string> = {}) => GET(new Request("http://x/api/health", { headers }));

beforeEach(() => {
  vi.stubEnv("ADMIN_USER_IDS", ADMIN);
  vi.stubEnv("HEALTH_TOKEN", "monitor-secret");
  mock.user.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/health", () => {
  it("аноним видит только ok", async () => {
    const body = await (await get()).json();
    expect(body).toEqual({ ok: true });
  });

  it("неверный токен не раскрывает подробности", async () => {
    expect(await (await get({ "x-health-token": "wrong" })).json()).toEqual({ ok: true });
  });

  it("мониторинг с HEALTH_TOKEN видит зависимости", async () => {
    const body = await (await get({ "x-health-token": "monitor-secret" })).json();
    expect(body).toMatchObject({ ok: true, mongo: true, aiConfigured: true });
    expect(typeof body.dbLatencyMs).toBe("number");
  });

  it("админ видит зависимости, обычный пользователь — нет", async () => {
    mock.user.mockResolvedValue({ id: ADMIN });
    expect(await (await get()).json()).toHaveProperty("mongo", true);
    mock.user.mockResolvedValue({ id: "a".repeat(24) });
    expect(await (await get()).json()).toEqual({ ok: true });
  });
});
