import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mongo", () => ({ isMongoConfigured: () => false }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: async () => ({ ok: true, resetAt: Date.now() }),
  clientIp: () => "1.1.1.1",
}));

import { GET } from "@/app/api/objectives/route";

describe("GET /api/objectives", () => {
  it("без предмета и без БД отвечает 400, а не 200 с ошибкой", async () => {
    const res = await GET(new Request("http://localhost/api/objectives?grade=5"));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/предмет/);
  });
});
