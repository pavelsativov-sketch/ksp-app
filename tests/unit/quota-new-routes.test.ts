import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * Новые AI-маршруты: вид квоты и исход слота.
 * ЕНТ/МОДО, СОР/СОЧ, школьные документы и Presenton — вспомогательные (assist);
 * учебная схема строится без AI и квоту не трогает. Слот подтверждается только
 * когда результат действительно выдан, иначе возвращается.
 */

const userId = "a".repeat(24);
const planId = "b".repeat(24);

const mock = vi.hoisted(() => ({
  reserve: vi.fn(), finalize: vi.fn(), insertOne: vi.fn(),
  entModo: vi.fn(), sorSoch: vi.fn(), complete: vi.fn(),
  presentonConfigured: vi.fn(), presenton: vi.fn(), plan: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ requireApiAuth: async () => ({ user: { id: "a".repeat(24) } }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: async () => ({ ok: true }), clientIp: () => "1.1.1.1" }));
vi.mock("@/lib/billing/quota", async (original) => ({
  ...await original<typeof import("@/lib/billing/quota")>(),
  reserveQuotaOrResponse: mock.reserve,
}));
vi.mock("@/lib/mongo", async (original) => ({
  ...await original<typeof import("@/lib/mongo")>(),
  isMongoConfigured: () => true,
  getDb: async () => ({ collection: () => ({ insertOne: mock.insertOne }) }),
}));
vi.mock("@/lib/ai/ent-modo-generator", () => ({ generateEntModoWork: mock.entModo }));
vi.mock("@/lib/ai/sor-soch-generator", () => ({ generateSorSochWork: mock.sorSoch }));
vi.mock("@/lib/ai/providers", async (original) => ({
  ...await original<typeof import("@/lib/ai/providers")>(),
  executeWithFallback: mock.complete,
}));
vi.mock("@/lib/materials/presenton", async (original) => ({
  ...await original<typeof import("@/lib/materials/presenton")>(),
  isPresentonConfigured: mock.presentonConfigured,
  generatePresentonDeck: mock.presenton,
  buildPresentonLessonContent: () => "content",
}));
vi.mock("@/lib/plans-repo", () => ({ getPlanById: mock.plan, getSubjectById: async () => null }));
vi.mock("@/lib/export/pptx", () => ({ buildKspPptx: async () => Buffer.from("PKlocal") }));
vi.mock("@/lib/billing/watermark", () => ({ resolveWatermark: async () => null }));

import { POST as entModoPOST } from "@/app/api/ai/ent-modo/route";
import { POST as sorSochPOST } from "@/app/api/ai/sor-soch/route";
import { POST as svgPOST } from "@/app/api/ai/svg-diagram/route";
import { POST as schoolToolsPOST } from "@/app/api/school/ai-tools/route";
import { POST as presentonPOST } from "@/app/api/materials/presenton/route";

const routeCtx = { params: Promise.resolve({}) };
const post = (body: unknown) => new Request("http://test", { method: "POST", body: JSON.stringify(body) });
const denied = () => ({ ok: false, response: NextResponse.json({ code: "ASSIST_QUOTA_EXCEEDED" }, { status: 429 }) });
const granted = () => ({ ok: true, reservation: { remaining: 5, finalize: mock.finalize } });

const entBody = { examKind: "ent_11", subject: "Математика", grade: 11 };
const sorBody = { subject: "Математика", grade: 7, quarter: 1, workType: "СОР №1" };
const toolBody = { tool: "homeroom", params: { topic: "Безопасность" } };

beforeEach(() => {
  vi.clearAllMocks();
  mock.reserve.mockResolvedValue(granted());
  mock.finalize.mockResolvedValue(undefined);
  mock.insertOne.mockResolvedValue({ insertedId: { toHexString: () => "c".repeat(24) } });
  mock.entModo.mockResolvedValue({ title: "ЕНТ" });
  mock.sorSoch.mockResolvedValue({ title: "СОР" });
  mock.complete.mockResolvedValue("# Документ");
  mock.presentonConfigured.mockReturnValue(true);
  mock.presenton.mockResolvedValue({ buffer: Buffer.from("PKdeck"), presentationId: "p", editUrl: null, creditsConsumed: 1 });
  mock.plan.mockResolvedValue({ id: planId, owner_id: userId, title: "План", language: "ru", subject_id: null, content: { topic: "Дроби" } });
});

describe("вид квоты новых маршрутов", () => {
  it.each([
    ["ent-modo", () => entModoPOST(post(entBody), routeCtx)],
    ["sor-soch", () => sorSochPOST(post(sorBody), routeCtx)],
    ["school/ai-tools", () => schoolToolsPOST(post(toolBody))],
    ["presenton", () => presentonPOST(post({ planId }))],
  ])("%s резервирует assist и отвечает 429 при исчерпании", async (_name, call) => {
    mock.reserve.mockResolvedValue(denied());
    const res = await call();
    expect(res.status).toBe(429);
    expect(mock.reserve).toHaveBeenCalledTimes(1);
    expect(mock.reserve.mock.calls[0]![1]).toBe("assist");
  });

  it("учебная схема строится без AI и квоты", async () => {
    const res = await svgPOST(post({ prompt: "круговорот воды" }), routeCtx);
    expect(res.status).toBe(200);
    expect(mock.reserve).not.toHaveBeenCalled();
  });
});

describe("исход слота", () => {
  it.each([
    ["ent-modo", () => entModoPOST(post(entBody), routeCtx)],
    ["sor-soch", () => sorSochPOST(post(sorBody), routeCtx)],
  ])("%s подтверждает слот после сохранения", async (_name, call) => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(mock.finalize.mock.calls).toEqual([[true]]);
  });

  it.each([
    ["ent-modo", () => entModoPOST(post(entBody), routeCtx)],
    ["sor-soch", () => sorSochPOST(post(sorBody), routeCtx)],
  ])("%s возвращает слот, если работа не сохранилась", async (_name, call) => {
    mock.insertOne.mockRejectedValue(new Error("db down"));
    const res = await call();
    expect(res.status).toBe(502);
    expect(mock.finalize.mock.calls).toEqual([[false]]);
  });

  it("ent-modo возвращает слот при сбое генерации", async () => {
    mock.entModo.mockRejectedValue(new Error("providers down"));
    const res = await entModoPOST(post(entBody), routeCtx);
    expect(res.status).toBe(502);
    expect(mock.finalize.mock.calls).toEqual([[false]]);
  });

  it("школьный документ: успех подтверждает, сбой возвращает", async () => {
    expect((await schoolToolsPOST(post(toolBody))).status).toBe(200);
    expect(mock.finalize.mock.calls).toEqual([[true]]);

    mock.finalize.mockClear();
    mock.complete.mockRejectedValue(new Error("providers down"));
    expect((await schoolToolsPOST(post(toolBody))).status).toBe(500);
    expect(mock.finalize.mock.calls).toEqual([[false]]);
  });

  it("неизвестный школьный инструмент не занимает слот", async () => {
    const res = await schoolToolsPOST(post({ tool: "nope", params: {} }));
    expect(res.status).toBe(400);
    expect(mock.reserve).not.toHaveBeenCalled();
  });

  it("Presenton: успех подтверждает слот", async () => {
    const res = await presentonPOST(post({ planId }));
    expect(res.headers.get("X-Deck-Engine")).toBe("presenton-v3");
    expect(mock.finalize.mock.calls).toEqual([[true]]);
  });

  it("Presenton: сбой возвращает слот, локальная сборка бесплатна", async () => {
    mock.presenton.mockRejectedValue(new Error("no balance"));
    const res = await presentonPOST(post({ planId }));
    expect(res.headers.get("X-Deck-Engine")).toBe("local-fallback");
    expect(mock.finalize.mock.calls).toEqual([[false]]);
  });

  it("Presenton не настроен — квоту не резервирует", async () => {
    mock.presentonConfigured.mockReturnValue(false);
    const res = await presentonPOST(post({ planId }));
    expect(res.headers.get("X-Deck-Engine")).toBe("local-fallback");
    expect(mock.reserve).not.toHaveBeenCalled();
  });
});
