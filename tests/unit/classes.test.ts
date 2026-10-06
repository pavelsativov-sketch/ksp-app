import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Классы и группы учителя: привязка планов, защита от чужих классов и
 * корректность учебного года (в РК учебный год начинается 1 сентября).
 */

/** Документ в фейковой коллекции: произвольные поля плюс ObjectId-обёртка. */
type FakeDoc = Record<string, unknown> & { _id?: { toString(): string } };
/** Минимальный интерфейс коллекции, используемой в тестах. */
interface FakeCollection {
  docs: FakeDoc[];
  insertOne(d: FakeDoc): Promise<{ insertedId: { toString(): string } }>;
  findOne(filter: Record<string, unknown>): Promise<FakeDoc | null>;
  find(filter: Record<string, unknown>): FakeCursor;
  countDocuments(filter: Record<string, unknown>): Promise<number>;
  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<{ matchedCount: number; modifiedCount: number }>;
  updateMany(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<{ matchedCount: number }>;
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
  COL: {
    classes: "teacher_classes",
    plans: "lesson_plans",
    kits: "lesson_kits",
    templates: "ksp_templates",
  },
  getDb: async () => ({
    collection: (name: string): FakeCollection => {
      if (!mocks.collections.has(name)) {
        const docs: FakeDoc[] = [];
        mocks.collections.set(name, {
          docs,
          insertOne: vi.fn(async (d: FakeDoc) => {
            // Уникальный индекс (owner_id, name) отвергает дубли — как в Mongo.
            const dup = docs.some(
              (x) => x.owner_id === d.owner_id && x.name === d.name && x.year === d.year,
            );
            if (dup) {
              throw Object.assign(new Error("E11000 duplicate key error"), { code: 11000 });
            }
            docs.push(d);
            // Настоящий 24-hex ObjectId: иначе проверка формата его отбросит.
            const hex = String(docs.length).padStart(24, "0");
            d._id = { toString: () => hex };
            return { insertedId: { toString: () => hex } };
          }),
          findOne: vi.fn(async (filter: Record<string, unknown>) => docs.find((d) => matchesId(d, filter)) ?? null),
          find: vi.fn((filter: Record<string, unknown>) => cursor(docs.filter((d) => matches(d, filter)))),
          countDocuments: vi.fn(async (filter: Record<string, unknown>) => docs.filter((d) => matches(d, filter)).length),
          updateOne: vi.fn(async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
            const doc = docs.find((d) => matchesId(d, filter));
            if (!doc) return { matchedCount: 0, modifiedCount: 0 };
            Object.assign(doc, update.$set ?? {});
            return { matchedCount: 1, modifiedCount: 1 };
          }),
          updateMany: vi.fn(async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
            const hit = docs.filter((d) => matches(d, filter));
            for (const d of hit) {
              const unset = update.$unset as Record<string, unknown> | undefined;
              if (unset) for (const k of Object.keys(unset)) delete d[k];
            }
            return { matchedCount: hit.length };
          }),
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

/** Сравнение с учётом ObjectId-ключей: фильтр приходит объектом, а в документе лежит обёртка. */
function matchesId(doc: FakeDoc, filter: Record<string, unknown>): boolean {
  const normalized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filter ?? {})) {
    normalized[k] = k === "_id" && v && typeof v === "object" && "toString" in v ? String(v) : v;
  }
  return matches({ ...doc, _id: doc._id?.toString() }, normalized);
}

function matches(doc: FakeDoc, filter: Record<string, unknown>): boolean {
  return Object.entries(filter ?? {}).every(([k, v]) => {
    const value = doc[k];
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const op = v as { $exists?: boolean; $in?: unknown[] };
      if (op.$exists !== undefined && (value !== undefined) !== op.$exists) return false;
      if (op.$in !== undefined && !op.$in.includes(value)) return false;
      return true;
    }
    return value === v;
  });
}

function cursor(items: FakeDoc[]): FakeCursor {
  return {
    sort: () => cursor(items),
    limit: () => cursor(items),
    toArray: async () => items,
  };
}

import { classBelongsTo, createClass, currentSchoolYear, deleteClass, listCurrentClasses, renameClass } from "@/lib/classes";

const OWNER = "a".repeat(24);
const OTHER = "b".repeat(24);

beforeEach(() => {
  mocks.collections.clear();
});

describe("currentSchoolYear", () => {
  it("учебный год начинается 1 сентября", () => {
    // До конца августа ещё идёт учебный год, начавшийся в прошлом календаре.
    expect(currentSchoolYear(new Date("2026-03-15T00:00:00Z"))).toBe(2025);
    expect(currentSchoolYear(new Date("2026-09-01T00:00:00Z"))).toBe(2026);
    expect(currentSchoolYear(new Date("2026-12-20T00:00:00Z"))).toBe(2026);
  });
});

describe("создание класса", () => {
  it("создаёт параллель с классом 1–11", async () => {
    const res = await createClass(OWNER, { name: "5-А", grade: 5 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.class.name).toBe("5-А");
      expect(res.class.grade).toBe(5);
      expect(res.class.year).toBe(currentSchoolYear());
    }
  });

  it("кружок и секция создаются без номера класса", async () => {
    const res = await createClass(OWNER, { name: "Робототехника" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.class.grade).toBeNull();
  });

  it("отказывает в пустом названии", async () => {
    const res = await createClass(OWNER, { name: "   " });
    expect(res.ok).toBe(false);
  });

  it("не даёт завести два одинаковых класса", async () => {
    await createClass(OWNER, { name: "5-А", grade: 5 });
    const second = await createClass(OWNER, { name: "5-А", grade: 5 });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toMatch(/уже есть/i);
  });

  it("у разных учителей одинаковое название не конфликтует", async () => {
    expect((await createClass(OWNER, { name: "5-А", grade: 5 })).ok).toBe(true);
    expect((await createClass(OTHER, { name: "5-А", grade: 5 })).ok).toBe(true);
  });
});

describe("привязка плана к классу", () => {
  it("принимает null и существующий класс учителя", async () => {
    expect(await classBelongsTo(OWNER, null)).toBe(true);
    const created = await createClass(OWNER, { name: "7-Б", grade: 7 });
    expect(created.ok).toBe(true);
    if (created.ok) expect(await classBelongsTo(OWNER, created.class.id)).toBe(true);
  });

  it("отклоняет класс чужого учителя", async () => {
    const created = await createClass(OTHER, { name: "7-Б", grade: 7 });
    expect(created.ok).toBe(true);
    if (created.ok) {
      // Класс существует, но принадлежит другому учителю.
      expect(await classBelongsTo(OWNER, created.class.id)).toBe(false);
    }
  });

  it("отклоняет некорректный идентификатор", async () => {
    expect(await classBelongsTo(OWNER, "bad")).toBe(false);
  });
});

describe("переименование и удаление", () => {
  it("переименовывает свой класс", async () => {
    const created = await createClass(OWNER, { name: "5-А", grade: 5 });
    if (!created.ok) throw new Error("setup");
    expect(await renameClass(OWNER, created.class.id, "5-Б")).toEqual({ ok: true });
    const list = await listCurrentClasses(OWNER);
    expect(list[0]?.name).toBe("5-Б");
  });

  it("не позволяет переименовать чужой класс", async () => {
    const created = await createClass(OTHER, { name: "5-А", grade: 5 });
    if (!created.ok) throw new Error("setup");
    const res = await renameClass(OWNER, created.class.id, "Взлом");
    expect(res.ok).toBe(false);
  });

  it("удаление класса снимает привязку с планов, но не удаляет их", async () => {
    const created = await createClass(OWNER, { name: "5-А", grade: 5 });
    if (!created.ok) throw new Error("setup");
    // Коллекция планов создаётся лениво — обращаемся через getDb.
    const db = await (await import("@/lib/mongo")).getDb();
    const plans = db.collection("lesson_plans") as unknown as { docs: FakeDoc[] };
    plans.docs.push({ owner_id: OWNER, class_id: created.class.id, title: "Дроби" });

    expect((await deleteClass(OWNER, created.class.id)).ok).toBe(true);
    expect(plans.docs).toHaveLength(1);
    expect(plans.docs[0].class_id).toBeUndefined();
    expect(plans.docs[0].title).toBe("Дроби");
  });

  it("не позволяет удалить чужой класс", async () => {
    const created = await createClass(OTHER, { name: "9-В", grade: 9 });
    if (!created.ok) throw new Error("setup");
    const res = await deleteClass(OWNER, created.class.id);
    expect(res.ok).toBe(false);
  });
});
