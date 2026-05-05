/**
 * Round-trip tests for `kspContentSchema`. The whole point of PR-6 fix #1 was
 * that zod's default strip-mode silently dropped pedagogical fields
 * (pointsScale, overallRubric, keyQuestions, descriptors, homework, etc.) on
 * every save. These tests guard against a regression of that bug.
 */
import { describe, it, expect } from "vitest";
import { kspContentSchema } from "./ksp";
import type { KspContent } from "@/lib/types/ksp";

function makeMinimalContent(): KspContent {
  return {
    header: {
      longTermPlanSection: "",
      school: "",
      date: "",
      teacherName: "",
      grade: "",
      studentsPresent: null,
      studentsAbsent: null,
    },
    topic: "Тестовая тема",
    learningObjectives: [],
    lessonObjectives: [],
    assessmentCriteria: [],
    languageObjectives: { terms: [], phrases: [] },
    values: "",
    crossCurricularLinks: "",
    priorKnowledge: "",
    stages: {
      beginning: emptyStage(),
      middle: emptyStage(),
      end: emptyStage(),
    },
    evaluation: {
      formativeAssessment: "",
      differentiation: "",
      healthAndSafety: "",
      reflection: "",
    },
  };
}

function emptyStage() {
  return {
    time: "",
    teacherActions: "",
    studentActions: "",
    resources: "",
    tasks: [],
  };
}

describe("kspContentSchema", () => {
  it("accepts a minimal valid content blob", () => {
    const result = kspContentSchema.safeParse(makeMinimalContent());
    expect(result.success).toBe(true);
  });

  it("rejects empty topic", () => {
    const bad = makeMinimalContent();
    bad.topic = "";
    const result = kspContentSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("preserves pointsScale on round-trip (PR-6 fix #1)", () => {
    const input = makeMinimalContent();
    input.pointsScale = [
      { label: "Активность", points: 3 },
      { label: "Корректность", points: 7 },
    ];
    const parsed = kspContentSchema.parse(input);
    expect(parsed.pointsScale).toEqual(input.pointsScale);
  });

  it("preserves overallRubric on round-trip (PR-9)", () => {
    const input = makeMinimalContent();
    input.overallRubric = Array.from({ length: 10 }, (_, i) => ({
      points: i + 1,
      descriptor: `Уровень ${i + 1}`,
    }));
    const parsed = kspContentSchema.parse(input);
    expect(parsed.overallRubric).toHaveLength(10);
    expect(parsed.overallRubric?.[9]).toEqual({
      points: 10,
      descriptor: "Уровень 10",
    });
  });

  it("preserves keyQuestions / descriptors / homework / summary / reflectionQuestions on stage", () => {
    const input = makeMinimalContent();
    input.stages.middle = {
      ...emptyStage(),
      keyQuestions: ["Что важно?", "Почему?"],
      descriptors: ["объясняет", "сравнивает"],
      homework: "Прочитать §5",
      summary: "Подвели итог",
      reflectionQuestions: ["Что было трудным?"],
      assessmentMethod: "Самооценка",
    };
    const parsed = kspContentSchema.parse(input);
    expect(parsed.stages.middle.keyQuestions).toEqual(["Что важно?", "Почему?"]);
    expect(parsed.stages.middle.descriptors).toEqual([
      "объясняет",
      "сравнивает",
    ]);
    expect(parsed.stages.middle.homework).toBe("Прочитать §5");
    expect(parsed.stages.middle.summary).toBe("Подвели итог");
    expect(parsed.stages.middle.reflectionQuestions).toEqual([
      "Что было трудным?",
    ]);
    expect(parsed.stages.middle.assessmentMethod).toBe("Самооценка");
  });

  it("validates each interactive task type", () => {
    const input = makeMinimalContent();
    input.stages.beginning.tasks = [
      {
        id: "t1",
        type: "MCQ",
        question: "2 + 2?",
        options: ["3", "4", "5"],
        correctIndex: 1,
        points: 1,
      },
      {
        id: "t2",
        type: "TRUE_FALSE",
        question: "Земля круглая",
        correct: true,
        points: 1,
      },
      {
        id: "t3",
        type: "NUMERIC",
        question: "π ≈ ?",
        answer: 3.14,
        tolerance: 0.01,
        points: 1,
      },
      {
        id: "t4",
        type: "MATCHING",
        question: "Соотнесите",
        left: ["A", "B"],
        right: ["1", "2"],
        pairs: [
          { leftIndex: 0, rightIndex: 0 },
          { leftIndex: 1, rightIndex: 1 },
        ],
        points: 1,
      },
    ];
    const result = kspContentSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects MCQ with <2 options", () => {
    const input = makeMinimalContent();
    input.stages.beginning.tasks = [
      {
        id: "t1",
        type: "MCQ",
        question: "?",
        options: ["only one"],
        correctIndex: 0,
        points: 1,
      },
    ];
    const result = kspContentSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
