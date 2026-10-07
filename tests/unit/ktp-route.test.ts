import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { emptyKsp } from "@/lib/types/ksp";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), plan: vi.fn(), subject: vi.fn(), watermark: vi.fn(), quota: vi.fn() }));
vi.mock("@/lib/api-auth", () => ({ requireApiAuth: mocks.auth }));
vi.mock("@/lib/plans-repo", () => ({ getPlanById: mocks.plan, getSubjectById: mocks.subject }));
vi.mock("@/lib/billing/watermark", () => ({ resolveWatermark: mocks.watermark }));
vi.mock("@/lib/billing/quota", () => ({ getPlanForUser: mocks.quota }));
import { POST } from "@/app/api/ktp/route";

const planId = "a".repeat(24);
const user = { id: "b".repeat(24), email: "teacher@example.test" };
const plan = () => ({
  id: planId, owner_id: user.id, title: "Дроби", grade: 5, language: "ru", subject_id: "c".repeat(24), visibility: "private",
  content: { ...emptyKsp(), topic: "Дроби", learningObjectives: [{ code: "5.1", text: "Сравнивать дроби" }] },
});
const request = (body: unknown) => new Request("http://localhost/api/ktp", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user });
  mocks.plan.mockResolvedValue(plan());
  mocks.subject.mockResolvedValue({ name_ru: "Математика", name_kz: "Математика kz" });
  mocks.watermark.mockResolvedValue(true);
  mocks.quota.mockResolvedValue({ limits: { ktp: true } });
});

describe("POST /api/ktp", () => {
  it("requires authentication before reading body or looking up a plan", async () => {
    mocks.auth.mockResolvedValue({ response: new Response(JSON.stringify({ error: "Требуется вход" }), { status: 401 }) });
    const response = await POST(request({ planId }));
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.plan).not.toHaveBeenCalled();
    expect(mocks.watermark).not.toHaveBeenCalled();
  });
  it.each(["private", "public", "unlisted"])("denies a different owner even for %s visibility", async (visibility) => {
    mocks.plan.mockResolvedValue({ ...plan(), owner_id: "other", visibility });
    const response = await POST(request({ planId }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.subject).not.toHaveBeenCalled();
    expect(mocks.watermark).not.toHaveBeenCalled();
  });
  it("returns the same 404 for a missing source", async () => {
    mocks.plan.mockResolvedValue(null);
    expect((await POST(request({ planId }))).status).toBe(404);
  });
  it.each([
    null, [], {}, { planId: "bad" }, { planId: 123 },
    { planId, userId: user.id }, { planId, watermark: false },
    { planId, topics: [] }, { planId, topics: [""] }, { planId, topics: ["   "] },
    { planId, topics: [1] }, { planId, topics: null }, { planId, topics: "Тема" },
    { planId, topics: ["я".repeat(301)] }, { planId, topics: Array(41).fill("Тема") },
    { planId, startDate: "2026-02-29" }, { planId, startDate: "2026-9-01" },
    { planId, startDate: "2026-09-01T00:00:00Z" }, { planId, startDate: null },
  ])("rejects invalid input %# before repository calls", async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Некорректные параметры КТП" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.plan).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON", async () => {
    const response = await POST(new Request("http://localhost/api/ktp", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
    expect(mocks.plan).not.toHaveBeenCalled();
  });
  it.each([false, true])("bounds bodies with or without Content-Length=%s", async (withLength) => {
    const response = await POST(new Request("http://localhost/api/ktp", {
      method: "POST", body: "я".repeat(33 * 1024),
      headers: withLength ? { "content-length": "67584" } : {},
    }));
    expect(response.status).toBe(413);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.plan).not.toHaveBeenCalled();
  });
  it.each([true, false])("returns same KTP data and valid Word with server watermark=%s", async (watermark) => {
    mocks.watermark.mockResolvedValue(watermark);
    const response = await POST(request({ planId, topics: [" Новая тема ", "Дроби"], startDate: "2024-02-29" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.plan).toHaveBeenCalledWith(planId);
    expect(mocks.subject).toHaveBeenCalledWith("c".repeat(24));
    expect(mocks.watermark).toHaveBeenCalledWith(user);
    const body = await response.json();
    expect(body.ktp).toEqual({
      title: "Дроби", subject: "Математика", grade: 5, language: "ru", draft: true,
      rows: [
        // Даты заполняются по неделям: 2024-02-29 (чт) → 07.03.
        { number: 1, topic: "Новая тема", hours: 1, date: "2024-02-29", objectives: "" },
        { number: 2, topic: "Дроби", hours: 1, date: "2024-03-07", objectives: "5.1 — Сравнивать дроби" },
      ],
    });
    const zip = await JSZip.loadAsync(Buffer.from(body.docxBase64, "base64"));
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Новая тема");
    expect(xml).toContain("2024-02-29");
    const footer = await zip.file(/^word\/footer\d*\.xml$/)[0].async("string");
    expect(footer.includes("бесплатный тариф")).toBe(watermark);
  });
  it("uses the default topic and no subject when source has no subject", async () => {
    mocks.plan.mockResolvedValue({ ...plan(), subject_id: null });
    const body = await (await POST(request({ planId }))).json();
    expect(body.ktp.subject).toBe("");
    expect(body.ktp.rows).toEqual([{ number: 1, topic: "Дроби", hours: 1, date: "", objectives: "5.1 — Сравнивать дроби" }]);
    expect(mocks.subject).not.toHaveBeenCalled();
  });
  it("selects the source language for subject names", async () => {
    mocks.plan.mockResolvedValue({ ...plan(), language: "kz" });
    expect((await (await POST(request({ planId }))).json()).ktp.subject).toBe("Математика kz");
  });
  it("does not leak internal repository errors", async () => {
    mocks.plan.mockRejectedValue(new Error("mongodb://private-host SECRET"));
    const response = await POST(request({ planId }));
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Не удалось создать КТП. Попробуйте ещё раз." });
  });
  it("denies free plans with 403 (KTP is a Pro feature)", async () => {
    mocks.quota.mockResolvedValue({ limits: { ktp: false } });
    const response = await POST(request({ planId, topics: ["Тема"] }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Календарно-тематический план доступен на тарифе Pro." });
    expect(mocks.plan).not.toHaveBeenCalled();
  });
  it("returns 503 when the tariff check is unavailable", async () => {
    mocks.quota.mockRejectedValue(new Error("db down"));
    const response = await POST(request({ planId, topics: ["Тема"] }));
    expect(response.status).toBe(503);
    expect(mocks.plan).not.toHaveBeenCalled();
  });
});
