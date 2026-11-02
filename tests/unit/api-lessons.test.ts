import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ createKsp: vi.fn(), auth: vi.fn() }));

vi.mock("@/lib/api-auth", () => ({ requireApiAuth: mock.auth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: async () => ({ ok: true }) }));
vi.mock("@/lib/agents/tools/product", () => ({ productTools: { createKsp: mock.createKsp } }));

import { POST } from "@/app/api/lessons/route";

const post = (body: unknown) => POST(new Request("http://x/api/lessons", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  mock.auth.mockResolvedValue({ user: { id: "u1" } });
});

describe("POST /api/lessons", () => {
  it("создаёт урок для текущего учителя и не копирует файл в песочницу", async () => {
    mock.createKsp.mockResolvedValue({ success: true, planId: "p1" });
    const res = await post({ grade: 5, subject: "Математика", topic: "Дроби", language: "kz" });
    expect(await res.json()).toEqual({ planId: "p1" });
    expect(mock.createKsp).toHaveBeenCalledWith(
      { grade: 5, subject: "Математика", topic: "Дроби", language: "kz", saveCopy: false },
      { userId: "u1", taskId: "site" },
    );
  });

  it("без темы не тратит квоту", async () => {
    const res = await post({ grade: 5, subject: "Математика", topic: "  " });
    expect(res.status).toBe(400);
    expect(mock.createKsp).not.toHaveBeenCalled();
  });

  it("передаёт понятную ошибку квоты и генерации", async () => {
    mock.createKsp.mockResolvedValue({ success: false, error: "Лимит бесплатных КСП исчерпан" });
    const res = await post({ grade: 5, subject: "Математика", topic: "Дроби" });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("Лимит");
  });

  it("без входа отвечает как requireApiAuth", async () => {
    mock.auth.mockResolvedValue({ response: new Response("no", { status: 401 }) });
    expect((await post({})).status).toBe(401);
  });
});
