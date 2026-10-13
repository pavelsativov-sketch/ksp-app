import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const mock = vi.hoisted(() => ({ getDb: vi.fn(), rate: vi.fn() }));
vi.mock("@/lib/mongo", async (original) => ({ ...await original<typeof import("@/lib/mongo")>(), getDb: mock.getDb }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: mock.rate }));

import {
  closeAssignment,
  createAssignment,
  createEditedReissue,
  getAssignmentResults,
  getPublicAssignment,
  previewAssignmentTasks,
  repeatAssignment,
  submitAttempt,
} from "@/lib/assignments";

const ownerId = "a".repeat(24);
const planId = "b".repeat(24);

async function createWithPreview(input: Record<string, unknown> & { taskIds: string[] }) {
  const preview = await previewAssignmentTasks(ownerId, { taskIds: input.taskIds });
  return createAssignment(ownerId, { ...input, previewFingerprint: preview.fingerprint });
}

const mcqTask = {
  id: "t_1", type: "MCQ", question: "2+2?", points: 2, hint: null,
  options: ["3", "4", "5"], correctIndex: 1,
};

let assignments: Array<Record<string, unknown>>;
let attempts: Array<Record<string, unknown>>;
let plans: Array<Record<string, unknown>>;

function matches(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([k, v]) => {
    if (k === "$expr") return true;
    if (typeof v === "object" && v !== null && ("$gte" in v || "$lt" in v)) return true;
    if (v instanceof ObjectId) return String(doc[k]) === v.toString();
    return doc[k] === v;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  assignments = []; attempts = [];
  plans = [{
    _id: new ObjectId(planId),
    owner_id: ownerId,
    title: "Дроби",
    content: { stages: { beginning: { tasks: [mcqTask] }, middle: { tasks: [] }, end: { tasks: [] } } },
  }];
  mock.rate.mockResolvedValue({ ok: true });
  mock.getDb.mockResolvedValue({
    collection: (name: string) => {
      if (name === "assignments") return {
        findOne: async (f: Record<string, unknown>) => assignments.find((d) => matches(d, f)) ?? null,
        insertOne: async (doc: Record<string, unknown>) => {
          if (assignments.some((a) => a.code === doc.code)) throw Object.assign(new Error("dup"), { code: 11000 });
          const saved = { ...doc, _id: new ObjectId() };
          assignments.push(saved);
          return { insertedId: saved._id };
        },
        updateOne: async (f: Record<string, unknown>, u: { $set?: Record<string, unknown>; $inc?: Record<string, number> }) => {
          const d = assignments.find((x) => matches(x, f));
          if (!d) return { matchedCount: 0 };
          Object.assign(d, u.$set);
          for (const [k, v] of Object.entries(u.$inc ?? {})) d[k] = Number(d[k] ?? 0) + v;
          return { matchedCount: 1 };
        },
        find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => assignments }) }) }),
      };
      if (name === "assignment_attempts") return {
        findOne: async (f: Record<string, unknown>) => attempts.find((d) => matches(d, f)) ?? null,
        // submitAttempt больше не делает read-modify-write: номер попытки
        // увеличивается атомарно через $inc в findOneAndUpdate.
        findOneAndUpdate: async (
          f: Record<string, unknown>,
          u: {
            $set?: Record<string, unknown>;
            $inc?: Record<string, number>;
            $setOnInsert?: Record<string, unknown>;
          },
          options: { upsert?: boolean; returnDocument?: string } = {},
        ) => {
          let doc = attempts.find((x) => matches(x, f));
          let upsertedId: ObjectId | null = null;
          if (!doc && options.upsert) {
            doc = { _id: new ObjectId(), ...(u.$setOnInsert ?? {}) };
            Object.assign(doc, u.$set ?? {});
            upsertedId = doc._id as ObjectId;
            attempts.push(doc);
          } else if (doc) {
            Object.assign(doc, u.$set ?? {});
          }
          if (doc) {
            for (const [k, v] of Object.entries(u.$inc ?? {})) doc[k] = Number(doc[k] ?? 0) + v;
          }
          return upsertedId ? { ...doc, upsertedId } : doc;
        },
        updateOne: async (f: Record<string, unknown>, u: { $set?: Record<string, unknown>; $inc?: Record<string, number>; $unset?: Record<string, unknown> }) => {
          const d = attempts.find((x) => matches(x, f));
          if (d) {
            Object.assign(d, u.$set);
            for (const key of Object.keys(u.$unset ?? {})) delete d[key];
          }
          else attempts.push({ ...f, ...u.$set, _id: new ObjectId() });
          return { matchedCount: d ? 1 : 0 };
        },
        countDocuments: async (f: Record<string, unknown>) => attempts.filter((d) => matches(d, f)).length,
        aggregate: () => ({ toArray: async () => [] }),
        find: (f: Record<string, unknown>) => ({ sort: () => ({ limit: () => ({ toArray: async () => attempts.filter((d) => matches(d, f)) }) }) }),
      };
      if (name === "lesson_plans") return {
        findOne: async (f: Record<string, unknown>) => plans.find((d) => matches(d, f)) ?? null,
        find: () => ({ sort: () => ({ limit: () => ({ project: () => ({ toArray: async () => plans }) }) }) }),
      };
      throw new Error(`Unexpected ${name}`);
    },
  });
});

describe("assignments", () => {
  it("requires a successful preview fingerprint before issuance", async () => {
    await expect(createAssignment(ownerId, { title: "T", taskIds: [`${planId}:0`] }))
      .rejects.toThrow("Некорректные данные выдачи");
  });

  it("creates from plan tasks and hides answers publicly", async () => {
    const { code } = await createWithPreview({
      title: "Дроби — домой", subject: "Математика", grade: 5,
      taskIds: [`${planId}:0`], planId, daysValid: 7,
    });
    expect(code).toMatch(/^\d{6}$/);
    const pub = await getPublicAssignment(code);
    expect(pub?.tasks).toHaveLength(1);
    // Правильный ответ не утекает ученику.
    expect(pub?.tasks[0]).not.toHaveProperty("correctIndex");
    expect(pub?.tasks[0]).toHaveProperty("options");
  });

  it("grades on the server and keeps the best attempt", async () => {
    const { code } = await createWithPreview({
      title: "T", taskIds: [`${planId}:0`], daysValid: 7,
    });
    const wrong = await submitAttempt(code, { name: "Алия", answers: [{ type: "MCQ", selectedIndex: 0 }] });
    expect(wrong.score).toBe(0);
    expect(wrong.details[0].correct).toBe(false);
    expect(wrong.details[0].summary).toBeNull();
    const right = await submitAttempt(code, { name: "Алия", answers: [{ type: "MCQ", selectedIndex: 1 }] });
    expect(right.score).toBe(2);
    expect(right.isBest).toBe(true);
    expect(right.details[0].correct).toBe(true);
    const laterWrong = await submitAttempt(code, { name: "Алия", answers: [{ type: "MCQ", selectedIndex: 0 }] });
    expect(laterWrong.isBest).toBe(false);
    const results = await getAssignmentResults(ownerId, String(assignments[0]._id));
    expect(results?.rows).toHaveLength(1);
    expect(results?.rows[0]).toMatchObject({ name: "Алия", score: 2, lastScore: 0, attempts: 3 });
    expect(assignments[0].attempts_count).toBe(1);
  });

  it("rejects wrong-type answers without crashing", async () => {
    const { code } = await createWithPreview({ title: "T", taskIds: [`${planId}:0`] });
    const r = await submitAttempt(code, { name: "Б", answers: [{ type: "TRUE_FALSE", selected: true }] });
    expect(r.score).toBe(0);
  });

  it("honors the teacher-selected no-feedback mode", async () => {
    const { code } = await createWithPreview({ title: "T", feedbackMode: "none", taskIds: [`${planId}:0`] });
    const result = await submitAttempt(code, { name: "Алия", answers: [{ type: "MCQ", selectedIndex: 1 }] });
    expect(result.details[0].summary).toBeNull();
    expect((await getPublicAssignment(code))?.feedbackMode).toBe("none");
  });

  it("lets the teacher edit a safe prompt/hint and creates a new linked snapshot", async () => {
    const first = await createWithPreview({ title: "T", taskIds: [`${planId}:0`] });
    const sourceId = String(assignments[0]._id);
    const sourceResults = await getAssignmentResults(ownerId, sourceId);
    if (!sourceResults) throw new Error("Expected owner results");
    const originalTasks = structuredClone(assignments[0].tasks);
    const next = await createEditedReissue(ownerId, sourceId, {
      title: "T — повтор",
      daysValid: 7,
      feedbackMode: "none",
      sourceFingerprint: sourceResults.editFingerprint,
      tasks: [{ id: "t_1", question: "Изменённый вопрос", hint: "Новая подсказка" }],
    });

    expect(next.code).not.toBe(first.code);
    expect(assignments[0].tasks).toEqual(originalTasks);
    expect(assignments[1]).toMatchObject({
      source: { assignmentId: sourceId },
      feedbackMode: "none",
      tasks: [{ question: "Изменённый вопрос", hint: "Новая подсказка", correctIndex: 1 }],
    });
    expect((await getPublicAssignment(next.code))?.tasks[0]).not.toHaveProperty("correctIndex");
  });

  it("rejects a stale reissue preview after the source snapshot changes", async () => {
    await createWithPreview({ title: "T", taskIds: [`${planId}:0`] });
    const sourceId = String(assignments[0]._id);
    const sourceResults = await getAssignmentResults(ownerId, sourceId);
    if (!sourceResults) throw new Error("Expected owner results");
    const sourceTasks = assignments[0].tasks as Array<Record<string, unknown>>;
    sourceTasks[0].question = "Changed after the teacher preview";

    await expect(createEditedReissue(ownerId, sourceId, {
      title: "T — повтор",
      feedbackMode: "correct_only",
      sourceFingerprint: sourceResults.editFingerprint,
      tasks: [{ id: "t_1", question: "Предпросмотр из старой версии", hint: "" }],
    })).rejects.toThrow("Исходная выдача изменилась");
    expect(assignments).toHaveLength(1);
  });

  it("repeats with a fresh code and closes", async () => {
    const first = await createWithPreview({ title: "T", taskIds: [`${planId}:0`] });
    const second = await repeatAssignment(ownerId, String(assignments[0]._id));
    expect(second.code).not.toBe(first.code);
    await closeAssignment(ownerId, String(assignments[0]._id));
    expect(await getPublicAssignment(first.code)).toMatchObject({ closed: true });
  });

  it("hides results from other users", async () => {
    const { code } = await createWithPreview({ title: "T", taskIds: [`${planId}:0`] });
    void code;
    expect(await getAssignmentResults("c".repeat(24), String(assignments[0]._id))).toBeNull();
  });
});
