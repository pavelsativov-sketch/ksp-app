/**
 * SSE задачи агента: логи одной миллисекунды не теряются, опрос базы
 * останавливается при отмене потока, тихий поток получает keepalive.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const userId = new ObjectId().toString();
const taskId = new ObjectId();
const taskFindOne = vi.fn();
const toArray = vi.fn();
const find = vi.fn((_filter: unknown) => ({ sort: () => ({ limit: () => ({ toArray }) }) }));

vi.mock("@/lib/api-auth", () => ({
  requireApiAuth: async () => ({ user: { id: userId } }),
}));
vi.mock("@/lib/mongo", () => ({
  COL: { agentTasks: "agent_tasks", agentExecutions: "agent_executions" },
  getDb: async () => ({
    collection: (name: string) =>
      name === "agent_tasks" ? { findOne: taskFindOne, updateOne: vi.fn() } : { find },
  }),
}));

const { GET } = await import("@/app/api/agents/task/[id]/route");

const decoder = new TextDecoder();
async function open(headers: Record<string, string> = {}) {
  const res = await GET(new Request("http://x/api/agents/task/1", { headers }), {
    params: Promise.resolve({ id: taskId.toString() }),
  });
  const reader = (res.body as ReadableStream<Uint8Array | string>).getReader();
  const chunks: string[] = [];
  void (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      chunks.push(typeof value === "string" ? value : decoder.decode(value));
    }
  })().catch(() => {});
  return { reader, chunks };
}
type LogFilter = { $and: [unknown, { $or: [{ created_at: { $gte: Date } }] }] };
const lastSince = () => (find.mock.calls.at(-1)![0] as LogFilter).$and[1].$or[0].created_at.$gte;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  taskFindOne.mockResolvedValue({ _id: taskId, user_id: new ObjectId(userId), status: "running", created_at: new Date(), heartbeat_at: new Date() });
  toArray.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe("SSE задачи агента", () => {
  it("лог той же миллисекунды, пришедший позже, доходит ровно один раз", async () => {
    const at = new Date();
    const a = { _id: new ObjectId(), type: "LOG", message: "a", created_at: at };
    const b = { _id: new ObjectId(), type: "LOG", message: "b", created_at: at };
    toArray.mockResolvedValueOnce([a]).mockResolvedValueOnce([a, b]);
    const { chunks } = await open();

    await vi.advanceTimersByTimeAsync(1400);

    expect(chunks.join("").match(/"message":"[ab]"/g)).toEqual(['"message":"a"', '"message":"b"']);
    expect(lastSince()).toEqual(at); // $gte по метке последнего лога
    expect(chunks.join("")).toContain(`id: ${at.getTime()}\n`);
  });

  it("после отмены потока база больше не опрашивается", async () => {
    const { reader } = await open();
    await vi.advanceTimersByTimeAsync(700);
    await reader.cancel();
    const calls = taskFindOne.mock.calls.length;

    await vi.advanceTimersByTimeAsync(7000);

    expect(taskFindOne.mock.calls.length).toBe(calls);
  });

  it("тихий поток получает keepalive-комментарий", async () => {
    const { chunks } = await open();
    await vi.advanceTimersByTimeAsync(700 * 20);
    expect(chunks.join("")).toContain(": keepalive\n\n");
  });

  it("переподключение продолжает с Last-Event-ID", async () => {
    await open({ "last-event-id": "1700000000000" });
    await vi.advanceTimersByTimeAsync(700);
    expect(lastSince()).toEqual(new Date(1700000000000));
  });

  it("поток закрывается по потолку жизни, опрос прекращается", async () => {
    taskFindOne.mockResolvedValue({ _id: taskId, user_id: new ObjectId(userId), status: "queued", created_at: new Date() });
    await open();
    await vi.advanceTimersByTimeAsync(31 * 60_000);
    const calls = taskFindOne.mock.calls.length;
    await vi.advanceTimersByTimeAsync(7000);
    expect(taskFindOne.mock.calls.length).toBe(calls);
  });
});
