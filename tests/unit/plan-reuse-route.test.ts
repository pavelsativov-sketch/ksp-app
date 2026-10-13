import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rateLimit: vi.fn(), getDb: vi.fn(), find: vi.fn(), sort: vi.fn(), limit: vi.fn(), toArray: vi.fn() }));
vi.mock("@/lib/api-auth", () => ({ requireApiAuth: mocks.auth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: mocks.rateLimit }));
vi.mock("@/lib/mongo", () => ({
  getDb: mocks.getDb,
  isMongoConfigured: () => true,
  COL: { plans: "lesson_plans" },
}));

import { GET } from "@/app/api/plans/reuse/route";

const task = {
  id: "task-1", type: "MCQ", question: "Сравни дроби", points: 2,
  options: ["1/2", "1/3"], correctIndex: 0,
};
const planId = "507f1f77bcf86cd799439011";
const plan = {
  _id: new ObjectId(planId), owner_id: "teacher-a", title: "Дроби", grade: 5, language: "ru",
  content: {
    topic: "Сравнение дробей",
    header: { teacherName: "Private teacher name", school: "School" },
    assessmentCriteria: ["Обосновывает сравнение"],
    stages: {
      beginning: { time: "0–5", teacherActions: "Повторить", studentActions: "Отвечают", resources: "", tasks: [task] },
      middle: { time: "5–35", teacherActions: "Исследовать", studentActions: "Решают", resources: "Карточки", tasks: [] },
      end: { time: "35–40", teacherActions: "Итог", studentActions: "Рефлексия", resources: "", tasks: [] },
    },
  },
};

function setupDatabase(docs = [plan]) {
  mocks.toArray.mockResolvedValue(docs);
  mocks.limit.mockReturnValue({ toArray: mocks.toArray });
  mocks.sort.mockReturnValue({ limit: mocks.limit });
  mocks.find.mockReturnValue({ sort: mocks.sort });
  mocks.getDb.mockResolvedValue({ collection: () => ({ find: mocks.find }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "teacher-a" }, response: null });
  mocks.rateLimit.mockResolvedValue({ ok: true, resetAt: Date.now() + 60_000 });
  setupDatabase();
});

describe("GET /api/plans/reuse", () => {
  it("scopes search to the authenticated owner and returns a minimal task preview", async () => {
    const response = await GET(new Request("https://app.test/api/plans/reuse?kind=task&q=сравни"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.find).toHaveBeenCalledWith(
      { owner_id: "teacher-a", moderation_hidden: { $ne: true } },
      expect.objectContaining({ projection: expect.objectContaining({ "content.stages.beginning.tasks": 1 }) }),
    );
    expect(body.blocks).toHaveLength(1);
    expect(body.blocks[0]).toMatchObject({
      kind: "task",
      source: { planId, title: "Дроби", grade: 5, language: "ru", topic: "Сравнение дробей", stageKey: "beginning" },
      preview: "Сравни дроби",
      payload: { id: "task-1", question: "Сравни дроби" },
    });
    expect(JSON.stringify(body)).not.toContain("Private teacher name");
    expect(JSON.stringify(body)).not.toContain("owner_id");
  });

  it("returns only searchable criteria and stages requested by kind", async () => {
    const criteria = await GET(new Request("https://app.test/api/plans/reuse?kind=criterion&q=обосновывает"));
    const criteriaBody = await criteria.json();
    expect(criteriaBody.blocks).toHaveLength(1);
    expect(criteriaBody.blocks[0]).toMatchObject({ kind: "criterion", payload: "Обосновывает сравнение" });

    const stages = await GET(new Request("https://app.test/api/plans/reuse?kind=stage&q=исследовать"));
    const stagesBody = await stages.json();
    expect(stagesBody.blocks).toHaveLength(1);
    expect(stagesBody.blocks[0]).toMatchObject({ kind: "stage", source: { stageKey: "middle" } });
  });

  it("does not query private plans for unauthenticated requests or invalid kinds", async () => {
    mocks.auth.mockResolvedValueOnce({ response: new Response("Unauthorized", { status: 401 }) });
    const denied = await GET(new Request("https://app.test/api/plans/reuse?kind=task"));
    expect(denied.status).toBe(401);
    expect(mocks.getDb).not.toHaveBeenCalled();

    const invalid = await GET(new Request("https://app.test/api/plans/reuse?kind=all"));
    expect(invalid.status).toBe(400);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("honors the per-owner rate limit before querying the database", async () => {
    mocks.rateLimit.mockResolvedValueOnce({ ok: false, resetAt: Date.now() + 5_000 });
    const response = await GET(new Request("https://app.test/api/plans/reuse?kind=task"));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
