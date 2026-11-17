import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * Вспомогательные материалы тратят квоту assist, полный КСП — generation.
 * Резерв отклоняется, поэтому маршруты не доходят до провайдеров.
 */

const mock = vi.hoisted(() => ({
  reserve: vi.fn(), finalize: vi.fn(), plan: vi.fn(), generateHandout: vi.fn(),
}));
vi.mock("@/lib/api-auth", () => ({ requireApiAuth: async () => ({ user: { id: "a".repeat(24) } }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: async () => ({ ok: true }) }));
vi.mock("@/lib/billing/quota", async (original) => ({
  ...await original<typeof import("@/lib/billing/quota")>(),
  reserveQuotaOrResponse: mock.reserve,
}));
vi.mock("@/lib/plans-repo", () => ({ getAccessiblePlan: mock.plan, getPlanById: mock.plan }));
vi.mock("@/lib/ai/providers", async (original) => ({
  ...await original<typeof import("@/lib/ai/providers")>(),
  isAnyProviderConfigured: () => true,
}));

import { POST as speechPOST } from "@/app/api/materials/teacher-speech/route";
import { POST as interactivePOST } from "@/app/api/materials/interactive/route";
import { POST as deckPOST } from "@/app/api/materials/deck/route";
import { generateHandout, HandoutQuotaError } from "@/lib/handouts/generate";
import { generateGroupWork } from "@/lib/handouts/group-work";

const planId = "b".repeat(24);
const post = (body: unknown) => new Request("http://test", { method: "POST", body: JSON.stringify(body) });
const denied = () => ({ ok: false, response: NextResponse.json({ code: "ASSIST_QUOTA_EXCEEDED" }, { status: 429 }) });

beforeEach(() => {
  vi.clearAllMocks();
  mock.reserve.mockResolvedValue(denied());
  mock.plan.mockResolvedValue({
    id: planId, owner_id: "a".repeat(24), title: "План",
    content: { topic: "Тема", stages: { middle: { tasks: [] } } },
  });
});

describe("квота вспомогательных материалов — assist", () => {
  it.each([
    ["teacher-speech", () => speechPOST(post({ planId }))],
    ["interactive", () => interactivePOST(post({ planId }))],
    ["deck", () => deckPOST(post({ planId }))],
  ])("%s резервирует assist", async (_name, call) => {
    const res = await call();
    expect(res.status).toBe(429);
    expect(mock.reserve).toHaveBeenCalledTimes(1);
    expect(mock.reserve.mock.calls[0]![1]).toBe("assist");
  });

  it("рабочий лист резервирует assist", async () => {
    const reserve = vi.fn(async () => ({ ok: false }));
    await expect(generateHandout({
      kind: "worksheet", topic: "Дроби", subject: "Математика", grade: 5, language: "ru", count: 3, quota: { reserve },
    })).rejects.toBeInstanceOf(HandoutQuotaError);
    expect(reserve).toHaveBeenCalledWith("assist");
  });

  it("групповая работа резервирует assist", async () => {
    const reserve = vi.fn(async () => ({ ok: false }));
    await expect(generateGroupWork({
      topic: "Дроби", subject: "Математика", grade: 5, language: "ru", mode: "group", count: 2, quota: { reserve },
    })).rejects.toBeInstanceOf(HandoutQuotaError);
    expect(reserve).toHaveBeenCalledWith("assist");
  });
});
