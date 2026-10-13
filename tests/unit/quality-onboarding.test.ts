import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyKsp } from "@/lib/types/ksp";
import { checkKspQuality } from "@/lib/ksp/quality";
import { kspContentSchema } from "@/lib/validation/ksp";

const mock = vi.hoisted(() => ({ getDb: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/mongo", async (original) => ({ ...await original<typeof import("@/lib/mongo")>(), getDb: mock.getDb }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mock.auth }));

import { completeOnboardingAction } from "@/app/actions/onboarding";

describe("checkKspQuality", () => {
  it("fails an empty plan and explains where to fix", () => {
    const { items, score } = checkKspQuality(emptyKsp());
    expect(score).toBeLessThan(30);
    expect(items.some((i) => i.status === "fail")).toBe(true);
    const points = items.find((i) => i.id === "points");
    expect(points?.status).toBe("warn");
    expect(points?.where).toContain("Ход урока");
  });

  it("scores a complete plan highly", () => {
    const content = emptyKsp();
    content.learningObjectives = [{ code: "5.1.2.1", text: "Складывать числа" }];
    content.lessonObjectives = ["A", "B", "C"];
    content.assessmentCriteria = ["К1", "К2", "К3"];
    content.values = "Честность";
    for (const key of ["beginning", "middle", "end"] as const) {
      content.stages[key].time = key === "beginning" ? "0–10 мин" : key === "middle" ? "10–40 мин" : "40–45 мин";
      content.stages[key].teacherActions = "Слова педагога: …";
      content.stages[key].studentActions = "Слушают";
      content.stages[key].resources = "Доска";
      content.stages[key].keyQuestions = ["Вопрос?"];
      content.stages[key].descriptors = ["Отвечает"];
      content.stages[key].assessmentMethod = "ФО";
    }
    content.stages.middle.tasks = [
      { id: "t1", type: "MCQ", question: "2+2?", points: 6, options: ["3", "4"], correctIndex: 1, objectiveCode: "5.1.2.1", criterionTexts: ["К1", "К2"] },
      { id: "t2", type: "TRUE_FALSE", question: "Верно?", points: 4, correct: true, objectiveCode: "5.1.2.1", criterionTexts: ["К3"] },
    ];
    content.stages.end.homework = "Параграф 5";
    content.stages.end.reflectionQuestions = ["Что узнали?"];
    content.evaluation = {
      formativeAssessment: "Светофор",
      differentiation: "Карточки",
      healthAndSafety: "Физкультминутка",
      reflection: "Что изменить?",
    };
    const { items, score } = checkKspQuality(content);
    expect(score).toBeGreaterThanOrEqual(90);
    expect(items.every((i) => i.status === "ok")).toBe(true);
  });

  it("detects wrong point totals and time", () => {
    const content = emptyKsp();
    content.stages.middle.tasks = [
      { id: "t1", type: "MCQ", question: "Q?", points: 3, options: ["a", "b"], correctIndex: 0 },
    ];
    content.stages.beginning.time = "0–10 мин";
    content.stages.middle.time = "10–20 мин";
    content.stages.end.time = "20–30 мин";
    const { items } = checkKspQuality(content);
    expect(items.find((i) => i.id === "points")?.status).toBe("warn");
    expect(items.find((i) => i.id === "time")?.hint).toContain("30");
    expect(items.find((i) => i.id === "timeline-continuity")?.status).toBe("ok");
  });

  it("warns about objectives without tasks and fails stale criterion links", () => {
    const content = emptyKsp();
    content.learningObjectives = [{ code: "5.1.2.1", text: "Goal one" }, { code: "5.1.2.2", text: "Goal two" }];
    content.assessmentCriteria = ["Explains", "Solves", "Checks"];
    content.stages.middle.tasks = [{
      id: "task-1", type: "MCQ", question: "Q?", points: 1, options: ["a", "b"], correctIndex: 0,
      objectiveCode: "5.1.2.1", criterionTexts: ["Removed criterion"],
    }];
    const { items } = checkKspQuality(content);
    expect(items.find((item) => item.id === "objective-coverage")?.status).toBe("warn");
    expect(items.find((item) => item.id === "task-criteria")?.status).toBe("fail");
  });

  it("warns when lesson intervals overlap or contain a long break", () => {
    const content = emptyKsp();
    content.stages.beginning.time = "0–10 мин";
    content.stages.middle.time = "8–20 мин";
    content.stages.end.time = "30–45 мин";
    const { items } = checkKspQuality(content);
    expect(items.find((item) => item.id === "timeline-continuity")?.status).toBe("warn");
  });

  it("uses teacher-selected duration and point targets instead of fixed thresholds", () => {
    const content = emptyKsp();
    content.qualityTargets = { durationMinutes: 60, taskPoints: 12 };
    content.stages.beginning.time = "0–10 мин";
    content.stages.middle.time = "10–40 мин";
    content.stages.end.time = "40–60 мин";
    content.stages.middle.tasks = [
      { id: "t1", type: "MCQ", question: "Q?", points: 7, options: ["a", "b"], correctIndex: 0 },
      { id: "t2", type: "TRUE_FALSE", question: "T?", points: 5, correct: true },
    ];
    const { items } = checkKspQuality(content);
    expect(items.find((item) => item.id === "time")).toMatchObject({ status: "ok" });
    expect(items.find((item) => item.id === "points")).toMatchObject({ status: "ok" });
  });

  it("keeps pre-target content valid and rejects target values outside the editor range", () => {
    const legacy = emptyKsp();
    legacy.topic = "Legacy lesson";
    expect(kspContentSchema.safeParse(legacy).success).toBe(true);
    expect(kspContentSchema.safeParse({ ...legacy, qualityTargets: { durationMinutes: 500, taskPoints: 0 } }).success).toBe(false);
  });

  it("detects Russian leakage in a Kazakh plan", () => {
    const content = emptyKsp();
    content.lessonObjectives = ["Учащиеся выполняют задание"];
    const { items } = checkKspQuality(content, "kz");
    expect(items.find((i) => i.id === "content-language")?.status).toBe("warn");
  });
});

describe("completeOnboardingAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.auth.mockResolvedValue({ id: "a".repeat(24), email: "t@example.invalid" });
    mock.getDb.mockResolvedValue({
      collection: () => ({ updateOne: async () => ({ matchedCount: 1 }) }),
    });
  });

  it("saves profile and requires login", async () => {
    expect(await completeOnboardingAction({ school: "Школа №1", subjects: ["Математика"], grades: [5] }))
      .toEqual({ ok: true });
    mock.auth.mockResolvedValue(null);
    expect((await completeOnboardingAction({})) as { error: string }).toHaveProperty("error");
  });
});
