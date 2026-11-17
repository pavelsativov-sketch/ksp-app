import { beforeEach, describe, expect, it, vi } from "vitest";

// Сбой БД/генерации в этих маршрутах должен давать JSON 500 с русским текстом.

const USER_ID = "a".repeat(24);
const mocks = vi.hoisted(() => ({ getDb: vi.fn(), createKsp: vi.fn() }));

vi.mock("@/lib/mongo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mongo")>("@/lib/mongo");
  return { ...actual, getDb: mocks.getDb, isMongoConfigured: () => true };
});
vi.mock("@/lib/api-auth", () => ({
  requireApiAuth: async () => ({ user: { id: "a".repeat(24), fullName: "Т" } }),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => ({ id: "a".repeat(24) }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: async () => ({ ok: true }) }));
vi.mock("@/lib/ai/history", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/history")>("@/lib/ai/history");
  return { ...actual, canViewAiHistory: async () => true };
});
vi.mock("@/lib/agents/tools/product", () => ({ productTools: { createKsp: mocks.createKsp } }));

import { GET as history } from "@/app/api/ai/history/route";
import { GET as search } from "@/app/api/plans/search/route";
import { GET as results } from "@/app/api/quiz/[code]/results/route";
import { POST as lessons } from "@/app/api/lessons/route";

async function expectJson500(res: Response) {
  expect(res.status).toBe(500);
  expect(((await res.json()) as { error: string }).error).toMatch(/Не удалось|недоступен/);
}

describe("JSON 500 при сбое", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getDb.mockRejectedValue(new Error("db down"));
    mocks.createKsp.mockRejectedValue(new Error("ai down"));
  });

  it("ai/history", async () => {
    await expectJson500(await history(new Request(`http://localhost/api/ai/history?user_id=${USER_ID}`)));
  });

  it("plans/search", async () => {
    await expectJson500(await search(new Request("http://localhost/api/plans/search?q=дроби")));
  });

  it("quiz/[code]/results", async () => {
    const res = await results(new Request("http://localhost/api/quiz/123456/results"), {
      params: Promise.resolve({ code: "123456" }),
    });
    await expectJson500(res);
  });

  it("lessons", async () => {
    const res = await lessons(new Request("http://localhost/api/lessons", {
      method: "POST",
      body: JSON.stringify({ grade: 5, subject: "Математика", topic: "Дроби" }),
    }));
    await expectJson500(res);
  });
});
