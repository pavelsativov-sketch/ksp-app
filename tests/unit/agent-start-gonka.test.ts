import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const mock = vi.hoisted(() => ({ getDb: vi.fn(), after: vi.fn(), setOwner: vi.fn() }));
vi.mock("@/lib/mongo", () => ({ getDb: mock.getDb, COL: { agentTasks: "agent_tasks", agentControls: "agent_controls" } }));
vi.mock("next/server", () => ({ after: mock.after }));
vi.mock("@/lib/agents/session", () => ({ setControlOwner: mock.setOwner }));
vi.mock("@/lib/agents/lease", () => ({ runningTaskIsStale: () => false }));
vi.mock("@/lib/agents/runner", () => ({ runAgentTask: vi.fn() }));

import { startAgentTask } from "@/lib/agents/orchestrator";

const userId = "a".repeat(24);

function database(handlers: {
  findOne?: () => Promise<unknown>;
  insertOne?: () => Promise<unknown>;
}) {
  return {
    collection: () => ({
      findOne: handlers.findOne ?? (async () => null),
      updateOne: async () => ({ matchedCount: 1 }),
      insertOne: handlers.insertOne ?? (async () => ({ insertedId: new ObjectId() })),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.after.mockImplementation(() => {});
  mock.setOwner.mockResolvedValue(undefined);
});

describe("startAgentTask: один слот на пользователя + очередь", () => {
  it("ставит новое поручение в очередь, пока бежит живая задача", async () => {
    const active = { _id: new ObjectId(), status: "running", heartbeat_at: new Date() };
    mock.getDb.mockResolvedValue(database({ findOne: async () => active }));
    const result = await startAgentTask(userId, null, "второе поручение");
    expect(result.status).toBe("queued");
    expect(result.id).toMatch(/^[0-9a-f]{24}$/i);
    // Раннер для queued-задачи не запускается.
    expect(mock.after).not.toHaveBeenCalled();
  });

  it("ставит в очередь и при гонке двух параллельных стартов (11000)", async () => {
    let insertCalls = 0;
    mock.getDb.mockResolvedValue(database({
      findOne: async () => null,
      insertOne: async () => {
        insertCalls++;
        // Первая попытка (running) натыкается на уникальный индекс; вторая
        // (queued) проходит — как было бы при параллельном старте.
        if (insertCalls === 1) {
          const dup = new Error("E11000 duplicate key");
          (dup as { code?: number }).code = 11000;
          throw dup;
        }
        return { insertedId: new ObjectId() };
      },
    }));
    const result = await startAgentTask(userId, null, "поручение");
    expect(result.status).toBe("queued");
    expect(mock.after).not.toHaveBeenCalled();
  });
});
