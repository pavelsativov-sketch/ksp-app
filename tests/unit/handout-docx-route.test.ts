import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rate: vi.fn(), watermark: vi.fn() }));
vi.mock("@/lib/api-auth", () => ({ requireApiAuth: mocks.auth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: mocks.rate }));
vi.mock("@/lib/billing/watermark", () => ({ resolveWatermark: mocks.watermark }));
vi.mock("@/lib/handouts/generate", () => ({ generateHandout: vi.fn() }));
import { POST as docxRoute } from "@/app/api/handouts/docx/route";
import { generateHandout } from "@/lib/handouts/generate";

// Минимальный валидный PNG 1×1: маршрут и упаковщик DOCX получают настоящие данные,
// при этом внешние сервисы (AI-текст, Cloudflare, БД) не вызываются.
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "a".repeat(24), email: "teacher@example.test" } });
  mocks.rate.mockResolvedValue({ ok: true, resetAt: Date.now() + 60000 });
  mocks.watermark.mockResolvedValue(true);
  vi.mocked(generateHandout).mockReset();
});

const task = (prompt: string) => ({
  type: "open" as const, prompt, criterion: "К", descriptor: "Д", points: 1,
});

describe("POST /api/handouts/docx", () => {
  it("embeds every requested image and links it from document.xml", async () => {
    vi.mocked(generateHandout).mockResolvedValue({
      kind: "worksheet",
      title: "Рабочий лист",
      intro: "Интро",
      metaLine: "ФИО: ____",
      cardLayout: true,
      tasks: [1, 2, 3].map((n) => ({ ...task(`Задание ${n}`), imageBase64: PNG_1X1, imageMime: "image/png", imageAlt: `Рисунок ${n}` })),
    });
    const response = await docxRoute(new Request("http://localhost/api/handouts/docx", {
      method: "POST",
      body: JSON.stringify({ kind: "worksheet", topic: "Дроби", subject: "Математика", grade: 5, count: 3, withImages: true }),
    }));
    expect(response.status).toBe(200);
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const media = Object.keys(zip.files).filter((name) => /^word\/media\/.+/.test(name) && !zip.files[name].dir);
    // docx дедуплицирует одинаковые картинки в один media-файл; важно, что файл есть
    // и каждая ссылка из document.xml на него резолвится.
    expect(media.length).toBeGreaterThanOrEqual(1);
    for (const name of media) {
      const payload = await zip.files[name].async("base64");
      expect(payload.length).toBeGreaterThan(0);
    }
    const relationships = await zip.file("word/_rels/document.xml.rels")!.async("string");
    const document = await zip.file("word/document.xml")!.async("string");
    const embedIds = [...document.matchAll(/r:embed="([^"]+)"/g)].map((match) => match[1]);
    expect(embedIds).toHaveLength(3);
    for (const id of embedIds) {
      expect(relationships).toMatch(new RegExp(`Id="${id}"[^>]*Target="media/[^"]+"`));
    }
  });

  it("surfaces a generation failure as JSON error instead of a corrupted download", async () => {
    vi.mocked(generateHandout).mockRejectedValue(new Error("Все AI провайдеры недоступны"));
    const response = await docxRoute(new Request("http://localhost/api/handouts/docx", {
      method: "POST",
      body: JSON.stringify({ kind: "worksheet", topic: "Дроби", subject: "Математика", grade: 5, count: 3 }),
    }));
    expect(response.status).toBe(502);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ error: "Не удалось создать раздаточный материал. Попробуйте ещё раз." });
    expect(body.includes("Все AI провайдеры")).toBe(false);
  });

  it("rejects unauthenticated requests before any generation", async () => {
    mocks.auth.mockResolvedValue({ response: new Response(null, { status: 401 }) });
    const response = await docxRoute(new Request("http://localhost/api/handouts/docx", {
      method: "POST",
      body: JSON.stringify({ kind: "worksheet", topic: "Дроби", subject: "Математика", grade: 5 }),
    }));
    expect(response.status).toBe(401);
    expect(generateHandout).not.toHaveBeenCalled();
  });
});
