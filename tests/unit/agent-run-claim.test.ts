/**
 * Атомарный захват задачи: повторный клик «Передать управление ИИ» и повтор
 * продолжения не поднимают второй раннер; «Стоп» снимает задачу и из очереди.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { fakeDb } from "../helpers/fake-mongo";

const mock = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import("../helpers/fake-mongo").fakeDb>,
  runAgentTask: vi.fn(async () => {}),
  apiAuth: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => { void fn(); } }));
vi.mock("@/lib/mongo", () => ({
  COL: { agentTasks: "agent_tasks", agentExecutions: "agent_executions" },
  getDb: () => mock.db.getDb(),
}));
vi.mock("@/lib/agents/runner", () => ({ runAgentTask: mock.runAgentTask }));
vi.mock("@/lib/agents/session", () => ({ setControlOwner: vi.fn(async () => {}) }));
vi.mock("@/lib/api-auth", () => ({ requireApiAuth: mock.apiAuth }));

import { claimNextQueuedTask, continueAgentTask, resurrectStalePausedTask } from "@/lib/agents/orchestrator";
import { POST as stopPOST } from "@/app/api/agents/task/[id]/stop/route";

const user = new ObjectId();
const tasks = async () => (await mock.db.getDb()).collection("agent_tasks");

async function addTask(extra: Record<string, unknown>) {
  const _id = new ObjectId();
  await (await tasks()).insertOne({ _id, user_id: user, prompt: "Составь КСП", created_at: new Date(), ...extra });
  return _id;
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.db = fakeDb();
  mock.apiAuth.mockResolvedValue({ user: { id: user.toString() } });
});

describe("захват прогона", () => {
  it("два клика «Передать управление ИИ» поднимают один раннер с новой меткой run_id", async () => {
    const id = await addTask({ status: "running", heartbeat_at: new Date(Date.now() - 10 * 60_000), run_id: "old" });

    const [a, b] = await Promise.all([resurrectStalePausedTask(user.toString()), resurrectStalePausedTask(user.toString())]);

    expect([a.action, b.action].sort()).toEqual(["alive", "resurrected"]);
    expect(mock.runAgentTask).toHaveBeenCalledTimes(1);
    const doc = await (await tasks()).findOne({ _id: id });
    expect(doc?.run_id).not.toBe("old");
    expect((mock.runAgentTask.mock.calls[0] as unknown[])[4]).toBe(doc?.run_id);
  });

  it("повтор одного и того же продолжения не запускает второй раннер", async () => {
    const id = await addTask({ status: "running", heartbeat_at: new Date(Date.now() - 1000), continuations: 1 });

    const results = await Promise.all([continueAgentTask(id.toString()), continueAgentTask(id.toString())]);

    expect(results.sort()).toEqual(["not_running", "started"]);
    expect(mock.runAgentTask).toHaveBeenCalledTimes(1);
  });
});

describe("остановка задачи из очереди", () => {
  it("queued-задача становится stopped, и диспетчер её не берёт", async () => {
    const id = await addTask({ status: "queued" });

    const res = await stopPOST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: id.toString() }) });

    expect(await res.json()).toEqual({ ok: true, status: "stopped" });
    expect((await (await tasks()).findOne({ _id: id }))?.status).toBe("stopped");
    expect(await claimNextQueuedTask((await tasks()) as never)).toBeNull();
  });

  it("завершённую задачу не трогает", async () => {
    const id = await addTask({ status: "completed" });
    const res = await stopPOST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: id.toString() }) });
    expect(await res.json()).toEqual({ ok: true, status: "completed" });
  });
});
