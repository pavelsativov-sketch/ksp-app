import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

vi.mock("@/lib/mongo", () => ({ getDb: vi.fn(), COL: { agentTasks: "agent_tasks", agentExecutions: "agent_executions" } }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/agents/session", () => ({ setControlOwner: vi.fn() }));
vi.mock("@/lib/agents/runner", () => ({ runAgentTask: vi.fn() }));

import { claimNextQueuedTask } from "@/lib/agents/orchestrator";

type Doc = {
  _id: ObjectId;
  user_id: ObjectId;
  status: string;
  prompt: string;
  created_at: Date;
  heartbeat_at?: Date;
  updated_at?: Date;
  error?: string;
};

/** Мини-коллекция с тем же уникальным индексом, что и в проде: один running на пользователя. */
function fakeCollection(initial: Doc[]) {
  const docs = initial.map((d) => ({ ...d }));
  const matches = (doc: Doc, filter: Record<string, unknown>) =>
    Object.entries(filter).every(([key, value]) => String((doc as unknown as Record<string, unknown>)[key]) === String(value));
  return {
    docs,
    find(filter: Record<string, unknown>) {
      let rows = docs.filter((d) => matches(d, filter));
      const cursor = {
        sort: () => {
          rows = [...rows].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
          return cursor;
        },
        limit: (n: number) => {
          rows = rows.slice(0, n);
          return cursor;
        },
        toArray: async () => rows.map((d) => ({ ...d })),
      };
      return cursor;
    },
    async findOne(filter: Record<string, unknown>) {
      const found = docs.find((d) => matches(d, filter));
      return found ? { ...found } : null;
    },
    async findOneAndUpdate(filter: Record<string, unknown>, update: { $set: Partial<Doc> }) {
      const found = docs.find((d) => matches(d, filter));
      if (!found) return null;
      if (update.$set.status === "running" && docs.some((d) => d !== found && d.status === "running" && String(d.user_id) === String(found.user_id))) {
        const error = new Error("E11000 duplicate key error");
        (error as { code?: number }).code = 11000;
        throw error;
      }
      Object.assign(found, update.$set);
      // mongodb >= 6: возвращается сам документ, без обёртки { value }.
      return { ...found };
    },
    async updateOne(filter: Record<string, unknown>, update: { $set?: Partial<Doc>; $unset?: Record<string, unknown> }) {
      const found = docs.find((d) => matches(d, filter));
      if (!found) return { modifiedCount: 0 };
      Object.assign(found, update.$set ?? {});
      for (const key of Object.keys(update.$unset ?? {})) delete (found as unknown as Record<string, unknown>)[key];
      return { modifiedCount: 1 };
    },
  };
}

const alice = new ObjectId();
const bob = new ObjectId();
let clock = 0;
function task(user: ObjectId, status: string, extra: Partial<Doc> = {}): Doc {
  clock += 1000;
  return { _id: new ObjectId(), user_id: user, status, prompt: `prompt-${clock}`, created_at: new Date(1_700_000_000_000 + clock), ...extra };
}

beforeEach(() => {
  clock = 0;
});

describe("claimNextQueuedTask", () => {
  it("берёт самую старую queued-задачу и переводит её в running", async () => {
    const first = task(alice, "queued");
    const second = task(bob, "queued");
    const col = fakeCollection([first, second]);
    const claimed = await claimNextQueuedTask(col as never);
    expect(String(claimed?._id)).toBe(String(first._id));
    expect(claimed?.prompt).toBe(first.prompt);
    expect(col.docs.find((d) => d._id === first._id)!.status).toBe("running");
  });

  it("очередь одного пользователя не блокирует остальных (баг E11000)", async () => {
    const aliceRunning = task(alice, "running", { heartbeat_at: new Date() });
    const aliceQueued = task(alice, "queued"); // самая старая queued, но слот Алисы занят
    const bobQueued = task(bob, "queued");
    const col = fakeCollection([aliceRunning, aliceQueued, bobQueued]);
    const claimed = await claimNextQueuedTask(col as never);
    expect(String(claimed?._id)).toBe(String(bobQueued._id));
    expect(col.docs.find((d) => d._id === aliceQueued._id)!.status).toBe("queued");
  });

  it("возвращает null, если кроме занятого слота ничего нет", async () => {
    const col = fakeCollection([task(alice, "running", { heartbeat_at: new Date() }), task(alice, "queued")]);
    await expect(claimNextQueuedTask(col as never)).resolves.toBeNull();
  });

  it("зомби-running (пульс давно умер) освобождается, и очередь едет дальше", async () => {
    const zombie = task(alice, "running", { heartbeat_at: new Date(Date.now() - 10 * 60_000) });
    const waiting = task(alice, "queued");
    const col = fakeCollection([zombie, waiting]);
    const claimed = await claimNextQueuedTask(col as never);
    expect(String(claimed?._id)).toBe(String(waiting._id));
    const zombieAfter = col.docs.find((d) => d._id === zombie._id)!;
    expect(zombieAfter.status).toBe("failed");
    expect(zombieAfter.heartbeat_at).toBeUndefined();
  });

  it("пустая очередь — null", async () => {
    await expect(claimNextQueuedTask(fakeCollection([]) as never)).resolves.toBeNull();
  });
});
