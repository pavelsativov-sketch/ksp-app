import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const mock = vi.hoisted(() => ({ getDb: vi.fn(), auth: vi.fn(), rate: vi.fn() }));
vi.mock("@/lib/mongo", async (original) => ({ ...await original<typeof import("@/lib/mongo")>(), getDb: mock.getDb }));
vi.mock("@/lib/api-auth", () => ({ requireApiAuth: mock.auth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: mock.rate }));

import { POST } from "@/app/api/ai/refund/route";

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
      if (name === "ai_events") return {
        countDocuments: async (filter: Record<string, unknown>) =>
          events.filter((e) => Object.entries(filter).every(([k, v]) => {
            if (typeof v === "object" && v !== null && ("$gte" in v || "$lt" in v)) return true;
            return e[k] === v;
          })).length,
        findOne: async () => events.find((e) => e.task === "generation") ?? null,
        deleteOne: async (filter: { _id: ObjectId }) => {
          const i = events.findIndex((e) => String(e._id) === String(filter._id));
          if (i >= 0) events.splice(i, 1);
          return { deletedCount: i >= 0 ? 1 : 0 };
        },
        insertOne: async (doc: Record<string, unknown>) => {
          events.push({ ...doc, _id: new ObjectId() });
          return { insertedId: new ObjectId() };
        },
      };
      throw new Error(`Unexpected ${name}`);
    },
  });
});

describe("POST /api/ai/refund", () => {
  it("refunds a fresh generation and returns remaining", async () => {
    events.push({ _id: new ObjectId(), user_id: userId, task: "generation", createdAt: new Date() });
    const res = await POST();
    expect(res.status).toBe(200);
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
      events.push({ _id: new ObjectId(), user_id: userId, task: "generation_refund", createdAt: new Date() });
    }
    events.push({ _id: new ObjectId(), user_id: userId, task: "generation", createdAt: new Date() });
    const res = await POST();
    expect(res.status).toBe(429);
  });

  it("401 without auth", async () => {
    mock.auth.mockResolvedValue({ response: new Response("x", { status: 401 }) });
    const res = await POST();
    expect(res.status).toBe(401);
  });
});
