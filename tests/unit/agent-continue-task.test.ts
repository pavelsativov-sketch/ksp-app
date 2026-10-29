/**
 * continueAgentTask: продолжение исполняется только для живой задачи и только
 * в пределах лимита продолжений.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { fakeDb } from "../helpers/fake-mongo";

const mock = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import("../helpers/fake-mongo").fakeDb>,
  runAgentTask: vi.fn(),
  after: vi.fn((work: () => unknown) => { void work(); }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: mock.after }));
vi.mock("@/lib/mongo", () => ({
  COL: { agentTasks: "agent_tasks", agentExecutions: "agent_executions" },
  getDb: () => mock.db.getDb(),
}));
vi.mock("@/lib/agents/runner", () => ({ runAgentTask: mock.runAgentTask }));
vi.mock("@/lib/agents/session", () => ({ setControlOwner: vi.fn() }));

import { continueAgentTask } from "@/lib/agents/orchestrator";
import { MAX_CONTINUATIONS } from "@/lib/agents/continuation";

const USER = new ObjectId();

function addTask(extra: Record<string, unknown> = {}) {
  const _id = new ObjectId();
  mock.db.getDb().then((db) => db.collection("agent_tasks").insertOne({ _id, user_id: USER, prompt: "Составь КСП", status: "running", continuations: 1, ...extra }));
  return _id.toString();
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.db = fakeDb();
  mock.runAgentTask.mockResolvedValue(undefined);
});

describe("continueAgentTask", () => {
  it("запускает выполнение живой задачи с её исходным поручением", async () => {
    const id = addTask();
    await vi.waitFor(() => expect(mock.db.collections.get("agent_tasks")?.docs).toHaveLength(1));
    expect(await continueAgentTask(id)).toBe("started");
    expect(mock.runAgentTask).toHaveBeenCalledTimes(1);
    const [taskId, prompt, userId] = mock.runAgentTask.mock.calls[0]!;
    expect([taskId, prompt, userId]).toEqual([id, "Составь КСП", USER.toString()]);
  });

  it("завершённую или остановленную задачу не оживляет", async () => {
    for (const status of ["completed", "failed", "stopped", "queued"]) {
      const id = addTask({ status });
      await vi.waitFor(() => expect(mock.db.collections.get("agent_tasks")?.docs.some((d) => String(d._id) === id)).toBe(true));
      expect(await continueAgentTask(id)).toBe("not_running");
    }
    expect(mock.runAgentTask).not.toHaveBeenCalled();
  });

  it("за пределом лимита продолжений не запускает", async () => {
    const id = addTask({ continuations: MAX_CONTINUATIONS + 1 });
    await vi.waitFor(() => expect(mock.db.collections.get("agent_tasks")?.docs).toHaveLength(1));
    expect(await continueAgentTask(id)).toBe("limit");
    expect(mock.runAgentTask).not.toHaveBeenCalled();
  });

  it("неизвестная и некорректная задача — not_running", async () => {
    expect(await continueAgentTask(new ObjectId().toString())).toBe("not_running");
    expect(await continueAgentTask("не-идентификатор")).toBe("not_running");
  });
});
