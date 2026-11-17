import { describe, it, expect, vi, beforeEach } from "vitest";

// Сбой сборки файла должен давать понятный JSON, а не пустой 500.

const mocks = vi.hoisted(() => ({
  buildKspDocx: vi.fn(),
}));

vi.mock("@/lib/mongo", () => ({ isMongoConfigured: () => true }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/plans-repo", () => ({
  getAccessiblePlan: async () => ({ id: "p1", title: "План" }),
}));
vi.mock("@/lib/billing/watermark", () => ({ resolveWatermark: async () => null }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: async () => ({ ok: true }),
  clientIp: () => "1.1.1.1",
}));
vi.mock("@/lib/export/docx", () => ({ buildKspDocx: mocks.buildKspDocx }));
vi.mock("@/lib/export/html", () => ({
  buildInteractiveHtml: () => "<html></html>",
  buildReadme: () => "readme",
}));

import { GET as getDocx } from "@/app/api/export/docx/[id]/route";
import { GET as getZip } from "@/app/api/export/zip/[id]/route";

const params = { params: Promise.resolve({ id: "p1" }) };

describe("export routes: ошибка сборки", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.buildKspDocx.mockRejectedValue(new Error("boom"));
  });

  it("docx возвращает JSON 500 с русским текстом", async () => {
    const res = await getDocx(new Request("http://localhost/api/export/docx/p1"), params);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Не удалось собрать/);
  });

  it("zip возвращает JSON 500 с русским текстом", async () => {
    const res = await getZip(new Request("http://localhost/api/export/zip/p1"), params);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Не удалось собрать архив/);
  });
});
