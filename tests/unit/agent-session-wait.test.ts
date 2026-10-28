import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ owner: "user" as "user" | "ai" }));
vi.mock("@/lib/mongo", () => ({
  COL: { agentControls: "agent_controls" },
  getDb: async () => ({
    collection: () => ({ findOne: async () => ({ owner: state.owner }), updateOne: async () => ({}) }),
  }),
}));

import { waitForControl } from "@/lib/agents/session";

const user = "a".repeat(24);

beforeEach(() => {
  state.owner = "user";
});

describe("waitForControl", () => {
  it("возвращает resumed, как только управление вернулось ИИ", async () => {
    state.owner = "ai";
    await expect(waitForControl(user, async () => false)).resolves.toBe("resumed");
  });

  it("возвращает stopped, если задачу остановили", async () => {
    await expect(waitForControl(user, async () => true)).resolves.toBe("stopped");
  });

  it("не ждёт бесконечно: после дедлайна возвращает timeout", async () => {
    const started = Date.now();
    const outcome = await waitForControl(user, async () => false, undefined, started - 1);
    expect(outcome).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
