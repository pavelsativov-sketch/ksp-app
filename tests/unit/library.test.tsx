// @vitest-environment jsdom
import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Db, Document } from "mongodb";
import { buildLibraryFilter, libraryHref, parseLibraryQuery } from "@/lib/library-query";
import { listLibraryPlans } from "@/lib/library-repo";
import { LibraryResults } from "@/components/ksp/library-results";
import LibraryPage from "@/app/library/page";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), subjects: vi.fn() }));
vi.mock("@/lib/mongo", () => ({ getDb: mocks.getDb, isMongoConfigured: () => true, COL: { plans: "lesson_plans", planLikes: "plan_likes" } }));
vi.mock("@/lib/plans-repo", () => ({ listSubjects: mocks.subjects }));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const subject = { id: "507f1f77bcf86cd799439011", name_ru: "Математика" };

it("bounds and validates scalar URL params and escapes literal searches", () => {
  expect(parseLibraryQuery({ q: "x".repeat(200), grade: "12", quarter: "5", subject: "$where", sort: "random", page: "-2" })).toEqual({ q: "x".repeat(120), grade: "", quarter: "", subject: "", language: "", dateFrom: "", dateTo: "", sort: "newest", page: 1 });
  expect(parseLibraryQuery({ q: ["one", "two"], page: "9999999" })).toMatchObject({ q: "", page: 1000000 });
  const filter = buildLibraryFilter(parseLibraryQuery({ q: "a.*(b)[c]$\\", grade: "5", quarter: "none", subject: subject.id }), [subject]);
  expect(filter).toMatchObject({ visibility: "public", is_draft: { $ne: true }, grade: 5, quarter: null, subject_id: subject.id });
  expect(filter.$or?.[0]).toEqual({ title: { $regex: "a\\.\\*\\(b\\)\\[c\\]\\$\\\\", $options: "i" } });
  // Совпадение по названию предмета ищем по существу, а не по индексу:
  // $or расширялся (полнотекстовый поиск по этапам и целям), жёсткий
  // $or[N] ломался на каждом новом поле.
  const bySubject = buildLibraryFilter(parseLibraryQuery({ q: "матем" }), [subject]).$or ?? [];
  expect(bySubject).toContainEqual({ subject_id: { $in: [subject.id] } });
});

function mockDb(total: number) {
  const countDocuments = vi.fn().mockResolvedValue(total);
  const toArray = vi.fn().mockResolvedValue([]);
  const aggregate = vi.fn().mockReturnValue({ toArray });
  const db = { collection: vi.fn().mockReturnValue({ countDocuments, aggregate }) } as unknown as Db;
  return { db, countDocuments, aggregate };
}

it("queries all matches, pages beyond the old 120 cap, and clamps stale pages", async () => {
  const { db, countDocuments, aggregate } = mockDb(170);
  const result = await listLibraryPlans(db, parseLibraryQuery({ page: "7", q: "older" }), [subject]);
  expect(result).toMatchObject({ total: 170, page: 7, pages: 8 });
  expect(countDocuments).toHaveBeenCalledWith(expect.objectContaining({ visibility: "public", is_draft: { $ne: true }, $or: expect.any(Array) }), { maxTimeMS: 5000 });
  const pipeline = aggregate.mock.calls[0][0] as Document[];
  expect(pipeline).toContainEqual({ $skip: 144 });
  expect(pipeline).toContainEqual({ $limit: 24 });
  // $lookup лайков больше нет: счётчик материализован в документе плана.
  // Раньше здесь стоял $lookup с `$expr: { $eq: [...] }`, а такое сравнение
  // не индексируется — на каждый план шёл COLLSCAN по всей коллекции
  // лайков, и сортировка «по популярности» делала это до пагинации.
  expect(pipeline.some((s) => s.$lookup)).toBe(false);
  expect((await listLibraryPlans(db, parseLibraryQuery({ page: "999" }), [])).page).toBe(8);
});

it("sorts popularity globally before paging, uses deterministic ties and bounds runtime", async () => {
  const { db, aggregate } = mockDb(200);
  await listLibraryPlans(db, parseLibraryQuery({ sort: "popularity", page: "2" }), []);
  const pipeline = aggregate.mock.calls[0][0] as Document[];
  // Популярность теперь считается индексом по likes_count, поэтому
  // $lookup отсутствует, а сам $sort идёт до пагинации.
  expect(pipeline.some((s) => s.$lookup)).toBe(false);
  expect(pipeline.findIndex((s) => s.$sort)).toBeLessThan(pipeline.findIndex((s) => s.$skip));
  expect(pipeline).toContainEqual({ $sort: { likes: -1, created_at: -1, _id: -1 } });
  // Счётчик нормализуется из likes_count.
  expect(pipeline).toContainEqual({ $set: { likes: { $ifNull: ["$likes_count", 0] } } });
  expect(aggregate.mock.calls[0][1]).toEqual({ maxTimeMS: 5000, allowDiskUse: true });
  await listLibraryPlans(db, parseLibraryQuery({ sort: "title" }), []);
  expect(aggregate.mock.calls[1][0]).toContainEqual({ $sort: { title: 1, _id: 1 } });
});

it("renders labelled URL filters and retained pagination without client filtering", () => {
  vi.stubGlobal("React", React);
  const query = parseLibraryQuery({ q: "a & b", subject: subject.id, grade: "5", quarter: "none", sort: "title", page: "2" });
  render(<LibraryResults query={query} subjects={[subject]} plans={[]} total={60} page={2} pages={3} />);
  for (const name of ["Поиск планов", "Предмет", "Класс", "Четверть", "Сортировка"]) expect(screen.getByLabelText(name)).toBeTruthy();
  const form = screen.getByRole("search");
  expect(form.getAttribute("method")).toBe("get");
  expect(form.querySelector('[name="page"]')).toBeNull();
  expect(screen.getByRole("link", { name: "Следующая" }).getAttribute("href")).toBe(libraryHref(query, 3));
  expect(screen.getByRole("status").textContent).toContain("НАЙДЕНО 60");
});

it("wires async page searchParams to the real repository helper with a mocked DB", async () => {
  vi.stubGlobal("React", React);
  const { db, countDocuments } = mockDb(0);
  mocks.getDb.mockResolvedValue(db);
  mocks.subjects.mockResolvedValue([subject]);
  render(await LibraryPage({ searchParams: Promise.resolve({ q: "Редкая тема", grade: "11" }) }));
  expect(countDocuments.mock.calls[0][0]).toMatchObject({ grade: 11, visibility: "public", is_draft: { $ne: true } });
  expect(screen.getByText(/Ничего не найдено/)).toBeTruthy();
});
