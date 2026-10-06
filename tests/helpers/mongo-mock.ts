/**
 * Переиспользуемый in-memory мок MongoDB для unit-тестов.
 *
 * Каждый тест вызывает `createMongoMock()` и получает чистый набор коллекций.
 * Коллекции создаются лениво и хранят документы в массивах — как настоящая
 * база, но без сети и диска. Поддерживаются операции, которые использует
 * бизнес-логика в src/lib: findOne, find (с курсором sort/skip/limit),
 * insertOne, updateOne, updateMany, deleteOne, deleteMany, countDocuments,
 * findOneAndUpdate, aggregate (с $match/$project/$sort/$limit/$vectorSearch).
 *
 * Пример:
 *   vi.mock("@/lib/mongo", async (original) => ({
 *     ...await original<typeof import("@/lib/mongo")>(),
 *     getDb: async () => createMongoMock().db,
 *   }));
 */
import { vi } from "vitest";
import { ObjectId, type Db } from "mongodb";

export interface MockCollection {
  docs: Record<string, unknown>[];
  insertOne: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
  find: ReturnType<typeof vi.fn>;
  updateOne: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
  deleteOne: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
  countDocuments: ReturnType<typeof vi.fn>;
  findOneAndUpdate: ReturnType<typeof vi.fn>;
  aggregate: ReturnType<typeof vi.fn>;
  bulkWrite: ReturnType<typeof vi.fn>;
}

export interface MongoMock {
  db: Db;
  collections: Map<string, MockCollection>;
  collection: (name: string) => MockCollection;
  reset: () => void;
}

/** Сравнение значения поля документа с фильтром с учётом ObjectId-обёрток. */
function matchesValue(actual: unknown, expected: unknown): boolean {
  if (expected === null) return actual === null || actual === undefined;
  if (expected instanceof ObjectId) return String(actual) === expected.toHexString();
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && expected.every((v, i) => matchesValue(actual[i], v));
  }
  if (typeof expected === "object" && expected !== null) {
    // Операторы Mongo: { $in: [...] }, { $gte: x }, { $ne: x }, { $exists: bool } и т.п.
    const ops = expected as Record<string, unknown>;
    return Object.entries(ops).every(([op, operand]) => {
      switch (op) {
        case "$in": return (operand as unknown[]).some((v) => matchesValue(actual, v));
        case "$nin": return !(operand as unknown[]).some((v) => matchesValue(actual, v));
        case "$ne": return !matchesValue(actual, operand);
        case "$eq": return matchesValue(actual, operand);
        case "$gte": return actual instanceof Date && operand instanceof Date
          ? actual.getTime() >= operand.getTime()
          : (actual as number) >= (operand as number);
        case "$gt": return actual instanceof Date && operand instanceof Date
          ? actual.getTime() > operand.getTime()
          : (actual as number) > (operand as number);
        case "$lte": return actual instanceof Date && operand instanceof Date
          ? actual.getTime() <= operand.getTime()
          : (actual as number) <= (operand as number);
        case "$lt": return actual instanceof Date && operand instanceof Date
          ? actual.getTime() < operand.getTime()
          : (actual as number) < (operand as number);
        case "$exists": return (actual !== undefined) === Boolean(operand);
        default: return false;
      }
    });
  }
  return actual === expected;
}

/** Проверка документа на соответствие фильтру (только равенство и операторы). */
export function matchesFilter(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  return Object.entries(filter ?? {}).every(([key, value]) => matchesValue(doc[key], value));
}

/** Курсор с цепочкой sort/skip/limit и toArray — как у mongodb-драйвера. */
function makeCursor(docs: Record<string, unknown>[]) {
  let rows = [...docs];
  const cursor = {
    sort: (spec: Record<string, number>) => {
      rows = [...rows].sort((a, b) => {
        for (const [key, dir] of Object.entries(spec)) {
          const av = a[key];
          const bv = b[key];
          if (av === bv) continue;
          if (av instanceof Date && bv instanceof Date) return (av.getTime() - bv.getTime()) * dir;
          if (av === undefined || bv === undefined) return 0;
          return String(av).localeCompare(String(bv)) * dir;
        }
        return 0;
      });
      return cursor;
    },
    skip: (n: number) => { rows = rows.slice(n); return cursor; },
    limit: (n: number) => { rows = rows.slice(0, n); return cursor; },
    project: () => cursor,
    toArray: async () => rows,
  };
  return cursor;
}

/**
 * Создаёт мок Db с ленивыми коллекциями. Имена коллекций принятые в проекте
 * (см. COL в src/lib/mongo.ts) — но можно использовать любые.
 */
export function createMongoMock(): MongoMock {
  const collections = new Map<string, MockCollection>();

  const collection = (name: string): MockCollection => {
    const existing = collections.get(name);
    if (existing) return existing;

    const docs: Record<string, unknown>[] = [];
    const col: MockCollection = {
      docs,
      insertOne: vi.fn(async (doc: Record<string, unknown>) => {
        const _id = doc._id ?? new ObjectId();
        docs.push({ ...doc, _id });
        return { insertedId: _id };
      }),
      findOne: vi.fn(async (filter: Record<string, unknown>) =>
        docs.find((d) => matchesFilter(d, filter)) ?? null),
      find: vi.fn((filter: Record<string, unknown>) => makeCursor(docs.filter((d) => matchesFilter(d, filter)))),
      updateOne: vi.fn(async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
        const doc = docs.find((d) => matchesFilter(d, filter));
        if (!doc) return { matchedCount: 0, modifiedCount: 0 };
        if (update.$set) Object.assign(doc, update.$set);
        if (update.$unset) for (const k of Object.keys(update.$unset)) delete doc[k];
        return { matchedCount: 1, modifiedCount: 1 };
      }),
      updateMany: vi.fn(async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
        const hit = docs.filter((d) => matchesFilter(d, filter));
        for (const d of hit) {
          if (update.$set) Object.assign(d, update.$set);
          if (update.$unset) for (const k of Object.keys(update.$unset)) delete d[k];
        }
        return { matchedCount: hit.length };
      }),
      deleteOne: vi.fn(async (filter: Record<string, unknown>) => {
        const i = docs.findIndex((d) => matchesFilter(d, filter));
        if (i < 0) return { deletedCount: 0 };
        docs.splice(i, 1);
        return { deletedCount: 1 };
      }),
      deleteMany: vi.fn(async (filter: Record<string, unknown>) => {
        const before = docs.length;
        const kept = docs.filter((d) => !matchesFilter(d, filter));
        docs.length = 0;
        docs.push(...kept);
        return { deletedCount: before - docs.length };
      }),
      countDocuments: vi.fn(async (filter: Record<string, unknown>) =>
        docs.filter((d) => matchesFilter(d, filter)).length),
      findOneAndUpdate: vi.fn(async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
        const doc = docs.find((d) => matchesFilter(d, filter));
        if (!doc) return null;
        if (update.$set) Object.assign(doc, update.$set);
        if (update.$unset) for (const k of Object.keys(update.$unset)) delete doc[k];
        return { ...doc };
      }),
      aggregate: vi.fn((pipeline: Record<string, unknown>[]) => {
        // Минимальная поддержка: $match → $project → $sort → $limit → $vectorSearch.
        // $vectorSearch делегируется переданной функции (тест решает, что вернуть).
        let rows = [...docs];
        let vectorSearch: (() => Promise<unknown[]>) | null = null;
        for (const stage of pipeline) {
          if ("$match" in stage) {
            rows = rows.filter((d) => matchesFilter(d, stage.$match as Record<string, unknown>));
          } else if ("$vectorSearch" in stage) {
            vectorSearch = () => Promise.resolve([]);
          } else if ("$project" in stage) {
            const proj = stage.$project as Record<string, unknown>;
            rows = rows.map((d) => {
              const out: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(proj)) out[k] = v === 1 ? d[k] : v;
              return out;
            });
          } else if ("$sort" in stage) {
            const sort = stage.$sort as Record<string, number>;
            rows.sort((a, b) => {
              for (const [k, dir] of Object.entries(sort)) {
                const av = a[k]; const bv = b[k];
                if (av === bv) continue;
                if (av instanceof Date && bv instanceof Date) return (av.getTime() - bv.getTime()) * dir;
                return (String(av).localeCompare(String(bv))) * dir;
              }
              return 0;
            });
          } else if ("$limit" in stage) {
            rows = rows.slice(0, stage.$limit as number);
          }
        }
        const cursor = {
          toArray: async () => (vectorSearch ? await vectorSearch() : rows),
        };
        return cursor;
      }),
      bulkWrite: vi.fn(async (ops: Array<{ updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> } }>) => {
        for (const op of ops) {
          const doc = docs.find((d) => matchesFilter(d, op.updateOne.filter));
          if (doc && op.updateOne.update.$set) Object.assign(doc, op.updateOne.update.$set);
        }
        return { result: { ok: 1 } };
      }),
    };
    collections.set(name, col);
    return col;
  };

  const db = { collection } as unknown as Db;
  return {
    db,
    collections,
    collection,
    reset: () => collections.clear(),
  };
}

/**
 * Подменяет модуль @/lib/mongo в тесте: реальные экспорты (COL, toObjectId)
 * сохраняются, а getDb возвращает переданный мок.
 */
export function mockMongoModule(getDbImpl: () => Promise<Db>) {
  return async (original: () => Promise<Record<string, unknown>>) => ({
    ...(await original()),
    getDb: getDbImpl,
  });
}
