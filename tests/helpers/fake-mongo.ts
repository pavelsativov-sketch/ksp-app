/**
 * Минимальная in-memory имитация коллекции MongoDB для модульных тестов:
 * равенство, $gt/$ne, $set, $push с $each/$slice, upsert, сортировка и лимит.
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

function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = doc[key];
    if (expected && typeof expected === "object" && !(expected instanceof Date) && !(expected as { _bsontype?: string })._bsontype) {
      const ops = expected as Record<string, unknown>;
      if ("$gt" in ops) return actual instanceof Date && ops.$gt instanceof Date && actual.getTime() > ops.$gt.getTime();
      if ("$ne" in ops) return !same(actual, ops.$ne);
    }
    return same(actual, expected);
  });
}

function applyUpdate(doc: Doc, update: Doc): void {
  const set = update.$set as Doc | undefined;
  if (set) Object.assign(doc, set);
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

  async insertOne(doc: Doc) {
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
      this.docs.push(created);
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }
    return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
  }

  async updateMany(filter: Doc, update: Doc) {
    const rows = this.docs.filter((d) => matches(d, filter));
    rows.forEach((d) => applyUpdate(d, update));
    return { matchedCount: rows.length, modifiedCount: rows.length };
  }
}

/** getDb-подмена: одна коллекция на каждое имя. */
export function fakeDb() {
  const collections = new Map<string, FakeCollection>();
  return {
    collections,
    getDb: async () => ({
      collection: (name: string) => {
        if (!collections.has(name)) collections.set(name, new FakeCollection());
        return collections.get(name)!;
      },
    }),
  };
}
