/**
 * Минимальная in-memory имитация коллекции MongoDB для модульных тестов:
 * равенство, $gt/$gte/$lt/$lte/$ne/$in/$exists, $or, $set/$unset/$inc,
 * $push с $each/$slice, upsert, уникальные поля, findOneAndUpdate, сортировка и лимит.
 * Этого хватает для проверки логики хранения без настоящей базы.
 */
type Doc = Record<string, unknown>;

function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a && b && typeof a === "object" && typeof b === "object" && "toString" in a && "toString" in b && (a as { _bsontype?: string })._bsontype) {
    return String(a) === String(b);
  }
  return a === b;
}

const time = (v: unknown) => (v instanceof Date ? v.getTime() : typeof v === "number" ? v : NaN);

function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") return (expected as Doc[]).some((sub) => matches(doc, sub));
    const actual = doc[key];
    if (expected === null) return actual === null || actual === undefined;
    if (expected && typeof expected === "object" && !(expected instanceof Date) && !(expected as { _bsontype?: string })._bsontype) {
      const ops = expected as Record<string, unknown>;
      if ("$gt" in ops) return time(actual) > time(ops.$gt);
      if ("$gte" in ops) return time(actual) >= time(ops.$gte);
      if ("$lt" in ops) return time(actual) < time(ops.$lt);
      if ("$lte" in ops) return time(actual) <= time(ops.$lte);
      if ("$ne" in ops) return !same(actual, ops.$ne);
      if ("$in" in ops) return (ops.$in as unknown[]).some((v) => same(actual, v));
      if ("$exists" in ops) return (actual !== undefined) === Boolean(ops.$exists);
    }
    return same(actual, expected);
  });
}

function applyUpdate(doc: Doc, update: Doc): void {
  const set = update.$set as Doc | undefined;
  if (set) Object.assign(doc, set);
  for (const key of Object.keys((update.$unset as Doc | undefined) ?? {})) delete doc[key];
  for (const [key, by] of Object.entries((update.$inc as Record<string, number> | undefined) ?? {})) {
    doc[key] = Number(doc[key] ?? 0) + by;
  }
  const push = update.$push as Record<string, { $each: unknown[]; $slice?: number }> | undefined;
  if (push) {
    for (const [key, spec] of Object.entries(push)) {
      const next = [...((doc[key] as unknown[] | undefined) ?? []), ...spec.$each];
      doc[key] = spec.$slice && spec.$slice < 0 ? next.slice(spec.$slice) : next;
    }
  }
}

export class FakeCollection {
  docs: Doc[] = [];
  /** Поля с уникальным индексом: вставка дубля бросает E11000, как в Mongo. */
  unique: string[] = [];

  private assertUnique(doc: Doc, except?: Doc) {
    for (const key of this.unique) {
      if (this.docs.some((d) => d !== except && same(d[key], doc[key]))) {
        throw Object.assign(new Error("E11000 duplicate key error"), { code: 11000 });
      }
    }
  }

  async insertOne(doc: Doc) {
    this.assertUnique(doc);
    this.docs.push({ ...doc });
    return { insertedId: doc._id };
  }

  find(filter: Doc = {}) {
    let rows = this.docs.filter((d) => matches(d, filter));
    const cursor = {
      sort: (spec: Record<string, 1 | -1>) => {
        const [[key, dir]] = Object.entries(spec);
        rows = [...rows].sort((a, b) => {
          const av = a[key] instanceof Date ? (a[key] as Date).getTime() : (a[key] as number);
          const bv = b[key] instanceof Date ? (b[key] as Date).getTime() : (b[key] as number);
          return (av - bv) * dir;
        });
        return cursor;
      },
      limit: (n: number) => { rows = rows.slice(0, n); return cursor; },
      toArray: async () => rows.map((r) => ({ ...r })),
    };
    return cursor;
  }

  async findOne(filter: Doc = {}) {
    const found = this.docs.find((d) => matches(d, filter));
    return found ? { ...found } : null;
  }

  async countDocuments(filter: Doc = {}) {
    return this.docs.filter((d) => matches(d, filter)).length;
  }

  async updateOne(filter: Doc, update: Doc, options: { upsert?: boolean } = {}) {
    const found = this.docs.find((d) => matches(d, filter));
    if (found) {
      applyUpdate(found, update);
      return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    }
    if (options.upsert) {
      const created: Doc = { ...Object.fromEntries(Object.entries(filter).filter(([, v]) => typeof v !== "object" || v instanceof Date)) };
      applyUpdate(created, update);
      this.assertUnique(created);
      this.docs.push(created);
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }
    return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
  }

  async findOneAndUpdate(filter: Doc, update: Doc) {
    const found = this.docs.find((d) => matches(d, filter));
    if (!found) return null;
    applyUpdate(found, update);
    return { ...found };
  }

  async updateMany(filter: Doc, update: Doc) {
    const rows = this.docs.filter((d) => matches(d, filter));
    rows.forEach((d) => applyUpdate(d, update));
    return { matchedCount: rows.length, modifiedCount: rows.length };
  }
}

/** getDb-подмена: одна коллекция на каждое имя; unique — уникальные индексы как в mongo.ts. */
export function fakeDb(unique: Record<string, string[]> = {}) {
  const collections = new Map<string, FakeCollection>();
  return {
    collections,
    getDb: async () => ({
      collection: (name: string) => {
        if (!collections.has(name)) {
          const created = new FakeCollection();
          created.unique = unique[name] ?? [];
          collections.set(name, created);
        }
        return collections.get(name)!;
      },
    }),
  };
}
