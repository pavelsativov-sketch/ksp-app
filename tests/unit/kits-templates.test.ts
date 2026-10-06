import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Комплекты материалов и шаблоны КСП: хранение, владение и то, что при
 * переиспользовании НЕ наследуется содержимое конкретного урока.
 */

type FakeDoc = Record<string, unknown> & { _id?: { toString(): string } };
interface FakeCollection {
  docs: FakeDoc[];
  insertOne(d: FakeDoc): Promise<{ insertedId: { toString(): string } }>;
  findOne(filter: Record<string, unknown>): Promise<FakeDoc | null>;
  find(filter: Record<string, unknown>): FakeCursor;
  countDocuments(filter: Record<string, unknown>): Promise<number>;
  deleteOne(filter: Record<string, unknown>): Promise<{ deletedCount: number }>;
}
interface FakeCursor {
  sort(): FakeCursor;
  limit(): FakeCursor;
  toArray(): Promise<FakeDoc[]>;
}

const mocks = vi.hoisted(() => ({
  collections: new Map<string, unknown>(),
  toObjectId: (id: string) => (/^[0-9a-f]{24}$/i.test(id) ? { toString: () => id } : null),
}));

vi.mock("@/lib/mongo", () => ({
  COL: { classes: "teacher_classes", plans: "lesson_plans", kits: "lesson_kits", templates: "ksp_templates" },
  getDb: async () => ({
    collection: (name: string): FakeCollection => {
      if (!mocks.collections.has(name)) {
        const docs: FakeDoc[] = [];
        mocks.collections.set(name, {
          docs,
          insertOne: vi.fn(async (d: FakeDoc) => {
            docs.push(d);
            const hex = String(docs.length).padStart(24, "0");
            d._id = { toString: () => hex };
            return { insertedId: { toString: () => hex } };
          }),
          findOne: vi.fn(async (filter: Record<string, unknown>) => docs.find((d) => matchesId(d, filter)) ?? null),
          find: vi.fn((filter: Record<string, unknown>) => cursor(docs.filter((d) => matches(d, filter)))),
          countDocuments: vi.fn(async (filter: Record<string, unknown>) => docs.filter((d) => matches(d, filter)).length),
          deleteOne: vi.fn(async (filter: Record<string, unknown>) => {
            const i = docs.findIndex((d) => matchesId(d, filter));
            if (i < 0) return { deletedCount: 0 };
            docs.splice(i, 1);
            return { deletedCount: 1 };
          }),
        } satisfies FakeCollection);
      }
      return mocks.collections.get(name) as FakeCollection;
    },
  }),
  toObjectId: mocks.toObjectId,
}));

function matchesId(doc: FakeDoc, filter: Record<string, unknown>): boolean {
  const normalized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filter ?? {})) {
    normalized[k] = k === "_id" && v && typeof v === "object" && "toString" in v ? String(v) : v;
  }
  return matches({ ...doc, _id: doc._id?.toString() }, normalized);
}
function matches(doc: FakeDoc, filter: Record<string, unknown>): boolean {
  return Object.entries(filter ?? {}).every(([k, v]) => doc[k] === v);
}
function cursor(items: FakeDoc[]): FakeCursor {
  return { sort: () => cursor(items), limit: () => cursor(items), toArray: async () => items };
}

import { deleteKit, getKit, listKits, saveKit } from "@/lib/kits";
import { createTemplate, deleteTemplate, listTemplates, templateAsPlanContent } from "@/lib/templates";
import { emptyKsp, type KspContent } from "@/lib/types/ksp";

const OWNER = "a".repeat(24);
const OTHER = "b".repeat(24);

beforeEach(() => {
  mocks.collections.clear();
});

const WORKSHEET = {
  kind: "worksheet" as const,
  title: "Рабочий лист: Дроби",
  intro: "",
  metaLine: "Класс: 5",
  tasks: [],
};

/** Контент КСП, наполненный под конкретный урок. */
function lessonContent(): KspContent {
  const base = emptyKsp();
  return {
    ...base,
    topic: "Дроби и их виды",
    lessonObjectives: ["5.1.2.1 — Объяснять смысл дроби"],
    stages: {
      beginning: { ...base.stages.beginning, time: "3 мин", tasks: [{ id: "t1", type: "MCQ" as const, question: "Q?", options: ["a", "b"], correctIndex: 0, points: 2 }] },
      middle: { ...base.stages.middle, time: "20 мин", homework: "§5, упр. 12" },
      end: { ...base.stages.end, time: "2 мин", tasks: [], summary: "Итог урока" },
    },
  };
}

describe("комплекты материалов", () => {
  it("сохраняет комплект и читает его обратно", async () => {
    const res = await saveKit(OWNER, {
      title: "Дроби — комплект",
      topic: "Дроби",
      handouts: [WORKSHEET],
      extra: null,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.kit.kinds).toEqual(["worksheet"]);

    const list = await listKits(OWNER);
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe("Дроби — комплект");
  });

  it("учитывает второй материал комплекта", async () => {
    const res = await saveKit(OWNER, {
      title: "Полный комплект",
      topic: "Дроби",
      handouts: [WORKSHEET],
      extra: { kind: "flashcards" as const, title: "Памятки", intro: "", cards: [] },
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.kit.kinds).toEqual(["worksheet", "flashcards"]);
  });

  it("чужой комплект недоступен для чтения и удаления", async () => {
    const res = await saveKit(OWNER, { title: "Мой", topic: "", handouts: [WORKSHEET], extra: null });
    if (!res.ok) throw new Error("setup");
    const kitId = res.kit.id;

    expect(await getKit(OTHER, kitId)).toBeNull();
    expect((await deleteKit(OTHER, kitId)).ok).toBe(false);
    // У чужого учителя комплект остался на месте.
    expect(await getKit(OWNER, kitId)).not.toBeNull();
  });

  it("отклоняет комплект без материалов", async () => {
    const res = await saveKit(OWNER, { title: "Пустой", topic: "", handouts: [], extra: null });
    expect(res.ok).toBe(false);
  });

  it("отклоняет комплект больше 3 МБ", async () => {
    // Размер считается по данным, прошедшим валидацию: неизвестные поля zod
    // вырезает, поэтому «раздувать» надо реальным полем.
    const huge = {
      ...WORKSHEET,
      tasks: Array.from({ length: 30 }, (_, i) => ({
        type: "open",
        prompt: `Задание ${i} ${"ы".repeat(120_000)}`,
        criterion: "К",
        descriptor: "Д",
        points: 0,
      })),
    };
    expect(Buffer.byteLength(JSON.stringify({ handouts: [huge] }), "utf8")).toBeGreaterThan(3 * 1024 * 1024);
    const res = await saveKit(OWNER, { title: "Огромный", topic: "", handouts: [huge], extra: null });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/3 МБ|больш/i);
  });
});

describe("шаблоны КСП", () => {
  it("сохраняет шаблон и подставляет его под новую тему", async () => {
    const res = await createTemplate(OWNER, {
      name: "Математика 5 класс",
      subject_id: null,
      grade: 5,
      content: lessonContent(),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const applied = await templateAsPlanContent(OWNER, res.template.id, "Умножение дробей");
    expect(applied).not.toBeNull();
    if (!applied) return;
    // Структура и цели переносятся.
    expect(applied.topic).toBe("Умножение дробей");
    expect(applied.lessonObjectives).toContain("5.1.2.1 — Объяснять смысл дроби");
  });

  // Ключевое: новый урок не должен унаследовать чужие задания и время.
  it("не переносит задания, время и домашнюю работу прошлого урока", async () => {
    const res = await createTemplate(OWNER, { name: "Т", grade: 5, content: lessonContent() });
    if (!res.ok) throw new Error("setup");
    const applied = await templateAsPlanContent(OWNER, res.template.id, "Новая тема");
    if (!applied) throw new Error("нет шаблона");

    expect(applied.stages.beginning.time).toBe("");
    expect(applied.stages.middle.time).toBe("");
    expect(applied.stages.middle.homework).toBe("");
    expect(applied.stages.end.tasks).toEqual([]);
    expect(applied.stages.beginning.tasks).toEqual([]);
  });

  it("шаблон при создании сразу очищает тему исходного урока", async () => {
    const res = await createTemplate(OWNER, { name: "Т2", grade: 5, content: lessonContent() });
    if (!res.ok) throw new Error("setup");
    const applied = await templateAsPlanContent(OWNER, res.template.id, "Любая");
    expect(applied?.topic).toBe("Любая");
  });

  it("чужой шаблон недоступен и не удаляется", async () => {
    // Шаблон принадлежит OTHER: OWNER не должен его ни прочитать, ни удалить.
    const res = await createTemplate(OTHER, { name: "Чужой", grade: 5, content: lessonContent() });
    if (!res.ok) throw new Error("setup");
    expect(await templateAsPlanContent(OWNER, res.template.id, "X")).toBeNull();
    expect((await deleteTemplate(OWNER, res.template.id)).ok).toBe(false);
    // У владельца шаблон остался на месте.
    expect(await listTemplates(OTHER)).toHaveLength(1);
  });

  it("удаляет свой шаблон", async () => {
    const res = await createTemplate(OWNER, { name: "Мой", grade: 5, content: lessonContent() });
    if (!res.ok) throw new Error("setup");
    expect((await deleteTemplate(OWNER, res.template.id)).ok).toBe(true);
    expect(await listTemplates(OWNER)).toHaveLength(0);
  });

  it("отклоняет пустое название", async () => {
    const res = await createTemplate(OWNER, { name: "   ", grade: 5, content: lessonContent() });
    expect(res.ok).toBe(false);
  });
});
