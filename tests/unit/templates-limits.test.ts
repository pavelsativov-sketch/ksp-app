import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMongoMock, matchesFilter } from "../helpers/mongo-mock";
import { makeKspContent, makeTemplate } from "../helpers/factories";

/**
 * Шаблоны КСП: лимит хранилища, сортировка списка и валидация названия.
 * Базовый счастливый путь покрыт kits-templates.test.ts — здесь границы.
 */

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/lib/mongo", async (original) => ({
  ...(await original<typeof import("@/lib/mongo")>()),
  getDb: mocks.getDb,
}));

import { createTemplate, listTemplates, templateAsPlanContent } from "@/lib/templates";

const OWNER = "a".repeat(24);

/** Наполняет коллекцию шаблонов N документами с разными updated_at. */
function seedTemplates(count: number, ownerId: string = OWNER) {
  const mongo = createMongoMock();
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    mongo.collection("ksp_templates").docs.push({
      ...makeTemplate(ownerId, { name: `Шаблон ${i}` }),
      // Обратный порядок: более старые имеют больший i.
      updated_at: new Date(now - i * 60_000),
      created_at: new Date(now - i * 60_000),
    });
  }
  mocks.getDb.mockResolvedValue(mongo.db);
  return mongo;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("лимит хранилища шаблонов", () => {
  it("rejects creation when the owner already has 50 templates", async () => {
    seedTemplates(50);
    const res = await createTemplate(OWNER, { name: "51-й", grade: 5, content: makeKspContent() });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/не более 50/i);
  });

  it("allows the 51st template for a different owner", async () => {
    seedTemplates(50, "b".repeat(24));
    const res = await createTemplate(OWNER, { name: "Первый", grade: 5, content: makeKspContent() });
    expect(res.ok).toBe(true);
  });

  it("does not count other owners' templates", async () => {
    // 50 шаблонов другого владельца — лимит у нас свой.
    seedTemplates(50, "b".repeat(24));
    expect(await listTemplates(OWNER)).toHaveLength(0);
    const res = await createTemplate(OWNER, { name: "Мой", grade: 5, content: makeKspContent() });
    expect(res.ok).toBe(true);
  });
});

describe("listTemplates", () => {
  it("returns templates sorted by updated_at descending", async () => {
    seedTemplates(3);
    const list = await listTemplates(OWNER);
    expect(list.map((t) => t.name)).toEqual(["Шаблон 0", "Шаблон 1", "Шаблон 2"]);
  });

  it("returns an empty array for an owner without templates", async () => {
    seedTemplates(2, "b".repeat(24));
    expect(await listTemplates(OWNER)).toEqual([]);
  });

  it("maps only the row fields, not the content", async () => {
    seedTemplates(1);
    const [row] = await listTemplates(OWNER);
    expect(row).toMatchObject({ id: expect.any(String), name: "Шаблон 0", createdAt: expect.any(String) });
    expect(row).not.toHaveProperty("content");
  });
});

describe("валидация названия", () => {
  it("rejects a name longer than 120 characters", async () => {
    seedTemplates(0);
    const res = await createTemplate(OWNER, { name: "я".repeat(121), grade: 5, content: makeKspContent() });
    expect(res.ok).toBe(false);
  });

  it("trims a name and accepts 120 characters", async () => {
    seedTemplates(0);
    const res = await createTemplate(OWNER, { name: `  ${"я".repeat(120)}  `, grade: 5, content: makeKspContent() });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.template.name).toHaveLength(120);
  });
});

describe("templateAsPlanContent", () => {
  it("returns null for a malformed id", async () => {
    seedTemplates(1);
    expect(await templateAsPlanContent(OWNER, "bad", "Тема")).toBeNull();
  });

  it("returns null for a non-existent template", async () => {
    seedTemplates(1);
    expect(await templateAsPlanContent(OWNER, "f".repeat(24), "Тема")).toBeNull();
  });

  it("clears topic when applying to a new lesson", async () => {
    seedTemplates(0);
    const res = await createTemplate(OWNER, {
      name: "Шаблон", grade: 5,
      content: makeKspContent({ topic: "Тема шаблона" }),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const applied = await templateAsPlanContent(OWNER, res.template.id, "Новая тема");
    expect(applied?.topic).toBe("Новая тема");
  });
});

// Проверяем, что хелпер мока фильтрует корректно (самотест хелпера).
describe("mongo-mock helper", () => {
  it("filters by equality and operators", async () => {
    const mongo = createMongoMock();
    mongo.collection("c").docs.push({ _id: { toString: () => "1" }, v: 1 }, { _id: { toString: () => "2" }, v: 2 });
    const { docs } = mongo.collection("c");
    expect(docs.filter((d) => matchesFilter(d, { v: 1 }))).toHaveLength(1);
    expect(docs.filter((d) => matchesFilter(d, { v: { $gte: 2 } }))).toHaveLength(1);
    expect(docs.filter((d) => matchesFilter(d, { v: { $in: [1, 2] } }))).toHaveLength(2);
    expect(docs.filter((d) => matchesFilter(d, { v: { $ne: 1 } }))).toHaveLength(1);
  });
});
