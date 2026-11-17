import { ObjectId } from "mongodb";

/**
 * In-memory коллекция ai_events для тестов квоты: равенство, $gte/$lt, $nor,
 * уникальный индекс слотов {user_id, task, month, seq}, $set/$unset,
 * findOneAndUpdate с сортировкой по createdAt и aggregate ($match + $group).
 */
type Doc = Record<string, unknown>;

const same = (a: unknown, b: unknown) =>
  a instanceof ObjectId || b instanceof ObjectId ? String(a) === String(b)
    : a instanceof Date && b instanceof Date ? a.getTime() === b.getTime()
      : a === b;

export function matchesEvent(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$nor") return !(expected as Doc[]).some((sub) => matchesEvent(doc, sub));
    const actual = doc[key];
    if (expected && typeof expected === "object" && !(expected instanceof Date) && !(expected instanceof ObjectId)) {
      const ops = expected as { $gte?: Date; $lt?: Date };
      if (ops.$gte && !((actual as Date) >= ops.$gte)) return false;
      if (ops.$lt && !((actual as Date) < ops.$lt)) return false;
      return true;
    }
    return same(actual, expected);
  });
}

function applyUpdate(doc: Doc, update: { $set?: Doc; $unset?: Doc }) {
  Object.assign(doc, update.$set ?? {});
  for (const k of Object.keys(update.$unset ?? {})) delete doc[k];
}

export function aiEventsCollection(events: () => Doc[]) {
  return {
    insertOne: async (entry: Doc) => {
      const all = events();
      if (typeof entry.seq === "number" && all.some((e) =>
        e.user_id === entry.user_id && e.task === entry.task && e.seq === entry.seq && e.month === entry.month)) {
        throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
      }
      const _id = (entry._id as ObjectId | undefined) ?? new ObjectId();
      all.push({ ...entry, _id });
      return { insertedId: _id };
    },
    findOne: async (filter: Doc) => events().find((e) => matchesEvent(e, filter)) ?? null,
    countDocuments: async (filter: Doc) => events().filter((e) => matchesEvent(e, filter)).length,
    updateOne: async (filter: Doc, update: { $set?: Doc; $unset?: Doc }) => {
      const doc = events().find((e) => matchesEvent(e, filter));
      if (doc) applyUpdate(doc, update);
      return { matchedCount: doc ? 1 : 0, modifiedCount: doc ? 1 : 0 };
    },
    findOneAndUpdate: async (filter: Doc, update: { $set?: Doc; $unset?: Doc }) => {
      const doc = events().filter((e) => matchesEvent(e, filter))
        .sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime())[0];
      if (!doc) return null;
      const before = { ...doc };
      applyUpdate(doc, update);
      return before;
    },
    deleteOne: async (filter: Doc) => {
      const all = events();
      const i = all.findIndex((e) => matchesEvent(e, filter));
      if (i >= 0) all.splice(i, 1);
      return { deletedCount: i >= 0 ? 1 : 0 };
    },
    deleteMany: async (filter: Doc) => {
      const all = events();
      const keep = all.filter((e) => !matchesEvent(e, filter));
      const deletedCount = all.length - keep.length;
      all.splice(0, all.length, ...keep);
      return { deletedCount };
    },
    aggregate: (pipeline: Doc[]) => ({
      toArray: async () => {
        let rows: Doc[] = [...events()];
        for (const stage of pipeline) {
          if (stage.$match) rows = rows.filter((e) => matchesEvent(e, stage.$match as Doc));
          if (stage.$group) {
            const keyPath = String((stage.$group as Doc)._id).replace(/^\$/, "");
            const byKey = new Map<string, number>();
            for (const e of rows) byKey.set(String(e[keyPath]), (byKey.get(String(e[keyPath])) ?? 0) + 1);
            rows = Array.from(byKey, ([_id, count]) => ({ _id, count }));
          }
        }
        return rows;
      },
    }),
  };
}
