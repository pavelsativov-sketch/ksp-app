import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const mock = vi.hoisted(() => ({ getDb: vi.fn(), auth: vi.fn(), rate: vi.fn() }));
vi.mock("@/lib/mongo", async (original) => ({ ...await original<typeof import("@/lib/mongo")>(), getDb: mock.getDb }));
vi.mock("@/lib/api-auth", () => ({ requireApiAuth: mock.auth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: mock.rate }));

import { POST } from "@/app/api/ai/refund/route";
import { aiEventsCollection } from "../helpers/ai-events-mock";

const userId = "b".repeat(24);
let events: Array<Record<string, unknown>>;

beforeEach(() => {
  vi.clearAllMocks();
  events = [];
  mock.auth.mockResolvedValue({ user: { id: userId, email: "t@example.invalid" } });
  mock.rate.mockResolvedValue({ ok: true });
  mock.getDb.mockResolvedValue({
    collection: (name: string) => {
      if (name === "users") return {
        findOne: async () => ({ _id: new ObjectId(userId), email: "t@example.invalid" }),
      };
      if (name === "ai_events") return aiEventsCollection(() => events);
      throw new Error(`Unexpected ${name}`);
    },
  });
});

/** Слот генерации, которую платформа убила до finalize: pending и старше maxDuration. */
function abandonedSlot(extra: Record<string, unknown> = {}) {
  return { _id: new ObjectId(), user_id: userId, task: "generation", kind: "slot", ok: true, pending: true,
    createdAt: new Date(Date.now() - 6 * 60_000), ...extra };
}

describe("POST /api/ai/refund", () => {
  it("успешную генерацию (слот подтверждён) вернуть нельзя", async () => {
    const { pending: _pending, ...finished } = abandonedSlot();
    events.push(finished);
    expect((await POST()).status).toBe(404);
    expect(events.filter((e) => e.task === "generation_refund")).toHaveLength(0);
  });

  it("идущую генерацию (pending моложе maxDuration) вернуть нельзя", async () => {
    events.push(abandonedSlot({ createdAt: new Date(Date.now() - 60_000) }));
    expect((await POST()).status).toBe(404);
  });

  it("повторный возврат той же генерации — 404", async () => {
    events.push(abandonedSlot());
    expect((await POST()).status).toBe(200);
    expect((await POST()).status).toBe(404);
  });

  it("refunds a generation whose slot was never finalized and returns remaining", async () => {
    events.push(abandonedSlot({ month: "2026-11", seq: 1 }));
    const res = await POST();
    expect(res.status).toBe(200);
    // Без seq маркер возврата не конфликтует с уникальным индексом слотов.
    expect(events.find((e) => e.task === "generation_refund")?.seq).toBeUndefined();
    const body = await res.json();
    expect(body.ok).toBe(true);
    // Слот удалён, остался только маркер возврата.
    expect(events.filter((e) => e.task === "generation")).toHaveLength(0);
    expect(events.filter((e) => e.task === "generation_refund")).toHaveLength(1);
  });

  it("404 without fresh generation", async () => {
    const res = await POST();
    expect(res.status).toBe(404);
  });

  it("429 after 3 refunds this month", async () => {
    for (let i = 0; i < 3; i++) {
      events.push({ _id: new ObjectId(), user_id: userId, task: "generation_refund", kind: "refund", createdAt: new Date() });
    }
    events.push(abandonedSlot());
    const res = await POST();
    expect(res.status).toBe(429);
  });

  it("один и тот же слот нельзя вернуть дважды параллельными запросами", async () => {
    events.push(abandonedSlot());
    const statuses = (await Promise.all([POST(), POST()])).map((r) => r.status).sort();
    expect(statuses).toEqual([200, 404]);
    expect(events.filter((e) => e.task === "generation_refund")).toHaveLength(1);
  });

  it("параллельные возвраты не превышают месячный лимит", async () => {
    for (let i = 0; i < 2; i++) {
      events.push({ _id: new ObjectId(), user_id: userId, task: "generation_refund", kind: "refund", createdAt: new Date() });
    }
    for (let i = 0; i < 2; i++) {
      events.push(abandonedSlot());
    }
    await Promise.all([POST(), POST()]);
    expect(events.filter((e) => e.task === "generation_refund").length).toBeLessThanOrEqual(3);
    // Откаченный слот снова считается расходом квоты.
    expect(events.filter((e) => e.task === "generation" && e.kind === "slot").length).toBeGreaterThanOrEqual(1);
  });

  it("401 without auth", async () => {
    mock.auth.mockResolvedValue({ response: new Response("x", { status: 401 }) });
    const res = await POST();
    expect(res.status).toBe(401);
  });
});
