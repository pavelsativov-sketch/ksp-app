import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createMongoMock } from "../helpers/mongo-mock";

/**
 * Классы учителя: список текущего учебного года, границы валидации и
 * переименование с пустым названием. Базовый путь покрыт classes.test.ts.
 */

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/lib/mongo", async (original) => ({
  ...(await original<typeof import("@/lib/mongo")>()),
  getDb: mocks.getDb,
}));

import { classBelongsTo, createClass, currentSchoolYear, listCurrentClasses, renameClass } from "@/lib/classes";

const OWNER = "a".repeat(24);

function seedClasses() {
  const mongo = createMongoMock();
  mocks.getDb.mockResolvedValue(mongo.db);
  return mongo;
}

/** Документ класса с ObjectId — как после insertOne. */
function classDoc(ownerId: string, name: string, grade: number | null, year: number) {
  return { _id: new ObjectId(), owner_id: ownerId, name, grade, year, created_at: new Date(), updated_at: new Date() };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listCurrentClasses", () => {
  it("returns only classes of the current school year", async () => {
    const mongo = seedClasses();
    const currentYear = currentSchoolYear();
    mongo.collection("teacher_classes").docs.push(
      classDoc(OWNER, "5-А", 5, currentYear),
      classDoc(OWNER, "6-Б", 6, currentYear - 1),
      classDoc(OWNER, "7-В", 7, currentYear + 1),
    );
    const list = await listCurrentClasses(OWNER);
    expect(list.map((c) => c.name)).toEqual(["5-А"]);
  });

  it("returns an empty array for an owner without classes", async () => {
    seedClasses();
    expect(await listCurrentClasses(OWNER)).toEqual([]);
  });

  it("does not leak classes between owners", async () => {
    const mongo = seedClasses();
    const currentYear = currentSchoolYear();
    mongo.collection("teacher_classes").docs.push(
      classDoc(OWNER, "5-А", 5, currentYear),
      classDoc("b".repeat(24), "6-Б", 6, currentYear),
    );
    expect((await listCurrentClasses(OWNER)).map((c) => c.name)).toEqual(["5-А"]);
    expect((await listCurrentClasses("b".repeat(24))).map((c) => c.name)).toEqual(["6-Б"]);
  });
});

describe("createClass: границы валидации", () => {
  it("rejects grade outside 1–11", async () => {
    seedClasses();
    expect((await createClass(OWNER, { name: "0-А", grade: 0 })).ok).toBe(false);
    expect((await createClass(OWNER, { name: "12-А", grade: 12 })).ok).toBe(false);
    expect((await createClass(OWNER, { name: "1-А", grade: 1 })).ok).toBe(true);
    expect((await createClass(OWNER, { name: "11-А", grade: 11 })).ok).toBe(true);
  });

  it("rejects a name longer than 60 characters", async () => {
    seedClasses();
    const res = await createClass(OWNER, { name: "я".repeat(61), grade: 5 });
    expect(res.ok).toBe(false);
  });

  it("trims the name before saving", async () => {
    seedClasses();
    const res = await createClass(OWNER, { name: "  5-А  ", grade: 5 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.class.name).toBe("5-А");
  });
});

describe("renameClass", () => {
  it("rejects renaming to an empty name", async () => {
    seedClasses();
    const created = await createClass(OWNER, { name: "5-А", grade: 5 });
    if (!created.ok) throw new Error("setup");
    expect((await renameClass(OWNER, created.class.id, "   ")).ok).toBe(false);
  });

  it("rejects renaming a non-existent class", async () => {
    seedClasses();
    expect((await renameClass(OWNER, "f".repeat(24), "5-Б")).ok).toBe(false);
  });
});

describe("classBelongsTo", () => {
  it("returns false for a non-existent class", async () => {
    seedClasses();
    expect(await classBelongsTo(OWNER, "f".repeat(24))).toBe(false);
  });
});
