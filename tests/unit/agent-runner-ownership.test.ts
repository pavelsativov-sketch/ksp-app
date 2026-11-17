/**
 * Раннер пишет финал только поверх своего running-прогона (run_id):
 * зомби не превращает чужой failed в completed, заменённый прогон уступает молча.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { fakeDb } from "../helpers/fake-mongo";

const mock = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import("../helpers/fake-mongo").fakeDb>,
  create: vi.fn(),
  release: vi.fn(async () => {}),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/mongo", () => ({
  COL: { agentTasks: "agent_tasks", agentExecutions: "agent_executions" },
  getDb: () => mock.db.getDb(),
}));
vi.mock("@/lib/agents/session", () => ({
  getControlOwner: vi.fn(async () => "ai"),
  setControlOwner: vi.fn(async () => {}),
  releaseControlToUser: mock.release,
  waitForControl: vi.fn(),
}));
vi.mock("@/lib/workspace/runtime", () => ({
  getWorkspaceRuntime: async () => ({ getSandboxStatus: async () => ({ available: false }) }),
}));
vi.mock("@/lib/agents/tools", () => ({ tools: {} }));
vi.mock("@/lib/agents/tools/browser", () => ({ flushBrowserPersist: vi.fn(async () => {}) }));
vi.mock("@/lib/agents/recipes", () => ({ matchRecipe: () => null, runRecipe: vi.fn() }));
vi.mock("@/lib/agents/orchestrator", () => ({ dispatchQueuedTask: vi.fn(async () => null) }));
vi.mock("@/lib/ai/providers", () => ({
  executeWithFallback: async (_k: string, fn: (...a: unknown[]) => Promise<string>) =>
    fn({ chat: { completions: { create: mock.create } } }, "m", {}, new AbortController().signal),
  rateLimitRetryMs: () => null,
}));

import { runAgentTask } from "@/lib/agents/runner";

const userId = new ObjectId().toString();
let taskOid: ObjectId;
const log = vi.fn(async () => {});

async function taskDoc() {
  return (await (await mock.db.getDb()).collection("agent_tasks").findOne({ _id: taskOid }))!;
}
async function mutateTask(patch: Record<string, unknown>) {
  await (await mock.db.getDb()).collection("agent_tasks").updateOne({ _id: taskOid }, { $set: patch });
}
const finishCall = {
  choices: [{ message: { content: "", tool_calls: [{ id: "1", function: { name: "finishTask", arguments: '{"summary":"готово"}' } }] } }],
};
const planReply = { choices: [{ message: { content: "{}" } }] };

beforeEach(async () => {
  vi.clearAllMocks();
  mock.db = fakeDb();
  taskOid = new ObjectId();
  await (await mock.db.getDb()).collection("agent_tasks").insertOne({
    _id: taskOid, user_id: new ObjectId(userId), status: "running", run_id: "run-1", heartbeat_at: new Date(),
  });
});

describe("runAgentTask: владение прогоном", () => {
  it("свой прогон завершает задачу и возвращает управление", async () => {
    mock.create.mockResolvedValueOnce(planReply).mockResolvedValueOnce(finishCall);
    await runAgentTask(taskOid.toString(), "сделай", userId, log, "run-1");
    expect((await taskDoc()).status).toBe("completed");
    expect(mock.release).toHaveBeenCalled();
  });

  it("зомби не перезатирает failed, выставленный другим, и не трогает управление", async () => {
    mock.create.mockResolvedValueOnce(planReply).mockImplementationOnce(async () => {
      await mutateTask({ status: "failed", error: "dispatch failed" });
      return finishCall;
    });
    await runAgentTask(taskOid.toString(), "сделай", userId, log, "run-1");
    const doc = await taskDoc();
    expect(doc.status).toBe("failed");
    expect(doc.error).toBe("dispatch failed");
    expect(mock.release).not.toHaveBeenCalled();
  });

  it("заменённый прогон уступает: ничего не пишет и шагов больше не делает", async () => {
    mock.create.mockResolvedValueOnce(planReply).mockImplementationOnce(async () => {
      await mutateTask({ run_id: "run-2" });
      return { choices: [{ message: { content: "думаю" } }] };
    });
    await runAgentTask(taskOid.toString(), "сделай", userId, log, "run-1");
    const doc = await taskDoc();
    expect(doc.status).toBe("running");
    expect(doc.run_id).toBe("run-2");
    expect(mock.create).toHaveBeenCalledTimes(2);
    expect(mock.release).not.toHaveBeenCalled();
  });
});
