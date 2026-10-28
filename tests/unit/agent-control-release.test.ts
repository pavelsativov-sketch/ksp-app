import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const mock = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/lib/mongo", () => ({ getDb: mock.getDb, COL: { agentTasks: "agent_tasks", agentControls: "agent_controls" } }));

import { releaseControlToUser } from "@/lib/agents/session";

const userId = "a".repeat(24);

function database(activeTaskId: string | null, owner: "user" | "ai") {
  const controlsUpdate = vi.fn(async () => ({ matchedCount: 1 }));
  return {
    db: {
      collection: (name: string) => {
        if (name === "agent_tasks") {
          return {
            findOne: async () =>
              activeTaskId ? { _id: new ObjectId(activeTaskId), status: "running" } : null,
          };
        }
        return {
          findOne: async () => ({ owner }),
          updateOne: controlsUpdate,
        };
      },
    },
    controlsUpdate,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("releaseControlToUser(taskId)", () => {
  it("не отнимает управление у новой живой задачи, если финиширует старая", async () => {
    // Активная задача — «новая» (id 111…), а завершается старая (222…).
    const { db, controlsUpdate } = database("111111111111111111111111", "ai");
    mock.getDb.mockResolvedValue(db);
    await releaseControlToUser(userId, "222222222222222222222222");
    expect(controlsUpdate).not.toHaveBeenCalled();
  });

  it("возвращает управление, когда завершается именно активная задача", async () => {
    const { db, controlsUpdate } = database("111111111111111111111111", "ai");
    mock.getDb.mockResolvedValue(db);
    await releaseControlToUser(userId, "111111111111111111111111");
    expect(controlsUpdate).toHaveBeenCalledTimes(1);
  });

  it("возвращает управление, если активной задачи уже нет", async () => {
    const { db, controlsUpdate } = database(null, "ai");
    mock.getDb.mockResolvedValue(db);
    await releaseControlToUser(userId, "111111111111111111111111");
    expect(controlsUpdate).toHaveBeenCalledTimes(1);
  });

  it("не трогает управление, если оно и так у пользователя", async () => {
    const { db, controlsUpdate } = database("111111111111111111111111", "user");
    mock.getDb.mockResolvedValue(db);
    await releaseControlToUser(userId, "111111111111111111111111");
    expect(controlsUpdate).not.toHaveBeenCalled();
  });
});
