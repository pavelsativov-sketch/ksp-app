import { describe, it, expect, vi, beforeEach } from "vitest";

// Сбой БД в лайках должен давать JSON 500, а не необработанное исключение.

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock("@/lib/mongo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mongo")>("@/lib/mongo");
  return { ...actual, getDb: mocks.getDb, isMongoConfigured: () => true };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: async () => ({ ok: true }),
  clientIp: () => "1.1.1.1",
}));

import { GET, POST } from "@/app/api/plans/[id]/like/route";

const ID = "0123456789abcdef01234567";
const params = { params: Promise.resolve({ id: ID }) };

describe("plans/[id]/like: сбой БД", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getDb.mockRejectedValue(new Error("db down"));
  });

  it("GET возвращает JSON 500", async () => {
    const res = await GET(new Request(`http://localhost/api/plans/${ID}/like`), params);
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toMatch(/Не удалось/);
  });

  it("POST возвращает JSON 500", async () => {
    const res = await POST(new Request(`http://localhost/api/plans/${ID}/like`, { method: "POST" }), params);
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toMatch(/Не удалось/);
  });
});
