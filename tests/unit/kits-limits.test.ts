import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMongoMock } from "../helpers/mongo-mock";
import { makeHandout, makeKit } from "../helpers/factories";

/**
 * Комплекты материалов: лимит хранилища, параметр limit в списке и
 * zod-дефолты схемы сохранения. Базовый путь покрыт kits-templates.test.ts.
 */

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/lib/mongo", async (original) => ({
  ...(await original<typeof import("@/lib/mongo")>()),
  getDb: mocks.getDb,
}));

import { deleteKit, getKit, kitSaveInputSchema, listKits, saveKit } from "@/lib/kits";

const OWNER = "a".repeat(24);

function seedKits(count: number, ownerId: string = OWNER) {
  const mongo = createMongoMock();
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    mongo.collection("lesson_kits").docs.push({
      ...makeKit(ownerId, { title: `Комплект ${i}` }),
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

describe("лимит хранилища комплектов", () => {
  it("rejects saving when the owner already has 100 kits", async () => {
    seedKits(100);
    const res = await saveKit(OWNER, { title: "101-й", topic: "", handouts: [makeHandout()], extra: null });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/не более 100/i);
  });

  it("allows the 101st kit for a different owner", async () => {
    seedKits(100, "b".repeat(24));
    const res = await saveKit(OWNER, { title: "Первый", topic: "", handouts: [makeHandout()], extra: null });
    expect(res.ok).toBe(true);
  });
});

describe("listKits", () => {
  it("returns kits sorted by updated_at descending", async () => {
    seedKits(3);
    const list = await listKits(OWNER);
    expect(list.map((k) => k.title)).toEqual(["Комплект 0", "Комплект 1", "Комплект 2"]);
  });

  it("respects the limit parameter", async () => {
    seedKits(5);
    expect(await listKits(OWNER, 2)).toHaveLength(2);
    expect(await listKits(OWNER, 10)).toHaveLength(5);
  });

  it("clamps a non-positive limit to 1", async () => {
    seedKits(3);
    expect(await listKits(OWNER, 0)).toHaveLength(1);
    expect(await listKits(OWNER, -5)).toHaveLength(1);
  });

  it("never returns more than the default 60 kits", async () => {
    seedKits(120);
    expect(await listKits(OWNER)).toHaveLength(60);
  });

  it("returns kinds including the extra handout", async () => {
    seedKits(1);
    const [row] = await listKits(OWNER);
    expect(row?.kinds).toEqual(["worksheet"]);
  });
});

describe("kitSaveInputSchema", () => {
  it("applies defaults for optional fields", () => {
    const parsed = kitSaveInputSchema.parse({ title: "Т", handouts: [makeHandout()] });
    expect(parsed).toMatchObject({ topic: "", subject_id: null, grade: null, class_id: null, extra: null });
  });

  it("coerces grade to an integer within 1–11", () => {
    expect(kitSaveInputSchema.parse({ title: "Т", grade: "5", handouts: [makeHandout()] }).grade).toBe(5);
    expect(kitSaveInputSchema.safeParse({ title: "Т", grade: 0, handouts: [makeHandout()] }).success).toBe(false);
    expect(kitSaveInputSchema.safeParse({ title: "Т", grade: 12, handouts: [makeHandout()] }).success).toBe(false);
  });

  it("validates subject_id and class_id as 24-hex", () => {
    expect(kitSaveInputSchema.safeParse({ title: "Т", subject_id: "bad", handouts: [makeHandout()] }).success).toBe(false);
    expect(kitSaveInputSchema.safeParse({ title: "Т", subject_id: "a".repeat(24), handouts: [makeHandout()] }).success).toBe(true);
    expect(kitSaveInputSchema.safeParse({ title: "Т", class_id: "bad", handouts: [makeHandout()] }).success).toBe(false);
  });

  it("rejects more than 4 handouts", () => {
    const handouts = Array.from({ length: 5 }, () => makeHandout());
    expect(kitSaveInputSchema.safeParse({ title: "Т", handouts }).success).toBe(false);
  });

  it("rejects an empty title and a title longer than 200 chars", () => {
    expect(kitSaveInputSchema.safeParse({ title: "  ", handouts: [makeHandout()] }).success).toBe(false);
    expect(kitSaveInputSchema.safeParse({ title: "я".repeat(201), handouts: [makeHandout()] }).success).toBe(false);
  });
});

describe("getKit / deleteKit", () => {
  it("returns null for a malformed id", async () => {
    seedKits(1);
    expect(await getKit(OWNER, "bad")).toBeNull();
    expect((await deleteKit(OWNER, "bad")).ok).toBe(false);
  });

  it("returns null for a non-existent kit", async () => {
    seedKits(1);
    expect(await getKit(OWNER, "f".repeat(24))).toBeNull();
  });
});
