import { beforeEach, describe, expect, it, vi } from "vitest";

/** Комплект «лист + памятки» — одна операция: один слот assist, а не два generation. */

const mock = vi.hoisted(() => ({ reserve: vi.fn(), finalize: vi.fn(), generate: vi.fn() }));
vi.mock("@/lib/api-auth", () => ({ requireApiAuth: async () => ({ user: { id: "a".repeat(24) } }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: async () => ({ ok: true }) }));
vi.mock("@/lib/billing/quota", async (original) => ({
  ...await original<typeof import("@/lib/billing/quota")>(),
  reserveQuotaOrResponse: mock.reserve,
}));
vi.mock("@/lib/handouts/generate", () => ({ generateHandout: mock.generate }));
vi.mock("@/lib/handouts/docx", () => ({ buildCombinedDocx: async () => Buffer.from("docx") }));
vi.mock("@/lib/billing/watermark", () => ({ resolveWatermark: async () => null }));

import { POST } from "@/app/api/handouts/combined/route";

const post = () => new Request("http://test", {
  method: "POST", body: JSON.stringify({ topic: "Дроби", subject: "Математика", grade: 5 }),
});

beforeEach(() => {
  vi.clearAllMocks();
  mock.reserve.mockResolvedValue({ ok: true, reservation: { remaining: 1, finalize: mock.finalize } });
  mock.finalize.mockResolvedValue(undefined);
  // Как настоящий generateHandout: просит слот текста у переданного контекста квоты.
  mock.generate.mockImplementation(async (input: { kind: string; quota: { reserve(k: string): Promise<{ ok: boolean }> } }) => {
    expect((await input.quota.reserve("assist")).ok).toBe(true);
    return { kind: input.kind };
  });
});

describe("POST /api/handouts/combined", () => {
  it("резервирует один слот assist и подтверждает его после выдачи", async () => {
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(mock.reserve).toHaveBeenCalledTimes(1);
    expect(mock.reserve.mock.calls[0]![1]).toBe("assist");
    expect(mock.finalize).toHaveBeenCalledWith(true);
  });

  it("возвращает слот, если одна из частей не удалась", async () => {
    mock.generate.mockRejectedValueOnce(new Error("provider down"));
    const res = await POST(post());
    expect(res.status).toBe(500);
    expect(mock.finalize).toHaveBeenCalledWith(false);
  });
});
