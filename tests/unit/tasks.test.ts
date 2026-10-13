import { describe, it, expect } from "vitest";
import {
  emptyTask,
  evaluateTask,
  taskTypeLabel,
  type FillBlankTask,
  type MatchingTask,
  type McqTask,
  type NumericTask,
  type OrderingTask,
  type ShortAnswerTask,
  type TrueFalseTask,
} from "@/lib/ksp/tasks";
import { interactiveTaskSchema } from "@/lib/validation/ksp";
import { buildUserPrompt } from "@/lib/ai/prompt";

describe("evaluateTask", () => {
  it("MCQ: correct selection scores full points", () => {
    const task: McqTask = {
      id: "1",
      type: "MCQ",
      question: "2+2?",
      points: 2,
      options: ["3", "4", "5", "6"],
      correctIndex: 1,
    };
    const r = evaluateTask(task, { type: "MCQ", selectedIndex: 1 });
    expect(r.isCorrect).toBe(true);
    expect(r.score).toBe(2);
    expect(r.maxScore).toBe(2);
  });

  it("MCQ: wrong selection scores 0 and reports correct option", () => {
    const task: McqTask = {
      id: "1",
      type: "MCQ",
      question: "?",
      points: 1,
      options: ["a", "b", "c", "d"],
      correctIndex: 2,
    };
    const r = evaluateTask(task, { type: "MCQ", selectedIndex: 0 });
    expect(r.isCorrect).toBe(false);
    expect(r.score).toBe(0);
    expect(r.feedback).toContain("c");
  });

  it("TRUE_FALSE: correct boolean", () => {
    const task: TrueFalseTask = {
      id: "1",
      type: "TRUE_FALSE",
      question: "Earth is round",
      points: 1,
      correct: true,
    };
    expect(evaluateTask(task, { type: "TRUE_FALSE", selected: true }).isCorrect).toBe(true);
    expect(evaluateTask(task, { type: "TRUE_FALSE", selected: false }).isCorrect).toBe(false);
  });

  it("SHORT_ANSWER: case- and whitespace-insensitive match", () => {
    const task: ShortAnswerTask = {
      id: "1",
      type: "SHORT_ANSWER",
      question: "Capital of Kazakhstan?",
      points: 1,
      acceptedAnswers: ["Астана", "Astana"],
    };
    expect(evaluateTask(task, { type: "SHORT_ANSWER", text: "  астана  " }).isCorrect).toBe(true);
    expect(evaluateTask(task, { type: "SHORT_ANSWER", text: "ASTANA" }).isCorrect).toBe(true);
    expect(evaluateTask(task, { type: "SHORT_ANSWER", text: "Алматы" }).isCorrect).toBe(false);
  });

  it("FILL_BLANK: partial credit by ratio", () => {
    const task: FillBlankTask = {
      id: "1",
      type: "FILL_BLANK",
      question: "",
      points: 4,
      template: "___ + ___ = ___",
      answers: ["2", "2", "4"],
    };
    const r = evaluateTask(task, { type: "FILL_BLANK", fillers: ["2", "3", "4"] });
    expect(r.isCorrect).toBe(false);
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(r.maxScore);
  });

  it("FILL_BLANK: rejects mismatched filler count", () => {
    const task: FillBlankTask = {
      id: "1",
      type: "FILL_BLANK",
      question: "",
      points: 1,
      template: "___",
      answers: ["x"],
    };
    expect(evaluateTask(task, { type: "FILL_BLANK", fillers: [] }).score).toBe(0);
  });

  it("MATCHING: full and partial scoring", () => {
    const task: MatchingTask = {
      id: "1",
      type: "MATCHING",
      question: "",
      points: 3,
      left: ["A", "B", "C"],
      right: ["1", "2", "3"],
      pairs: [
        { leftIndex: 0, rightIndex: 0 },
        { leftIndex: 1, rightIndex: 1 },
        { leftIndex: 2, rightIndex: 2 },
      ],
    };
    const full = evaluateTask(task, {
      type: "MATCHING",
      pairs: [
        { leftIndex: 0, rightIndex: 0 },
        { leftIndex: 1, rightIndex: 1 },
        { leftIndex: 2, rightIndex: 2 },
      ],
    });
    expect(full.isCorrect).toBe(true);
    expect(full.score).toBe(3);

    const partial = evaluateTask(task, {
      type: "MATCHING",
      pairs: [
        { leftIndex: 0, rightIndex: 0 },
        { leftIndex: 1, rightIndex: 2 },
        { leftIndex: 2, rightIndex: 1 },
      ],
    });
    expect(partial.isCorrect).toBe(false);
    expect(partial.score).toBe(1);
  });

  it("ORDERING: scores by positional matches", () => {
    const task: OrderingTask = {
      id: "1",
      type: "ORDERING",
      question: "",
      points: 4,
      items: ["a", "b", "c", "d"],
      correctOrder: [0, 1, 2, 3],
    };
    expect(evaluateTask(task, { type: "ORDERING", order: [0, 1, 2, 3] }).isCorrect).toBe(true);
    expect(evaluateTask(task, { type: "ORDERING", order: [3, 2, 1, 0] }).score).toBe(0);
    expect(evaluateTask(task, { type: "ORDERING", order: [0, 2, 1, 3] }).score).toBe(2);
  });

  it("NUMERIC: tolerance bounds", () => {
    const task: NumericTask = {
      id: "1",
      type: "NUMERIC",
      question: "π?",
      points: 1,
      answer: 3.14,
      tolerance: 0.05,
    };
    expect(evaluateTask(task, { type: "NUMERIC", value: 3.14 }).isCorrect).toBe(true);
    expect(evaluateTask(task, { type: "NUMERIC", value: 3.18 }).isCorrect).toBe(true);
    expect(evaluateTask(task, { type: "NUMERIC", value: 3.5 }).isCorrect).toBe(false);
    expect(evaluateTask(task, { type: "NUMERIC", value: null }).feedback).toMatch(/число/);
  });

  it("type mismatch is rejected", () => {
    const task: McqTask = {
      id: "1",
      type: "MCQ",
      question: "?",
      points: 1,
      options: ["a", "b"],
      correctIndex: 0,
    };
    const r = evaluateTask(task, { type: "TRUE_FALSE", selected: true });
    expect(r.isCorrect).toBe(false);
  });
});

describe("emptyTask", () => {
  it("creates well-formed scaffolds for every type", () => {
    for (const t of ["MCQ", "TRUE_FALSE", "SHORT_ANSWER", "FILL_BLANK", "MATCHING", "ORDERING", "NUMERIC"] as const) {
      const x = emptyTask(t);
      expect(x.type).toBe(t);
      expect(x.points).toBe(1);
      expect(x.id).toMatch(/^t_/);
    }
  });
});

describe("taskTypeLabel", () => {
  it("returns Russian label for each type", () => {
    expect(taskTypeLabel("MCQ")).toMatch(/выбор/i);
    expect(taskTypeLabel("NUMERIC")).toMatch(/числов/i);
  });
});

describe("interactiveTaskSchema (AI-flat input)", () => {
  it("accepts null hint/objectiveCode and normalizes them", () => {
    const parsed = interactiveTaskSchema.safeParse({
      id: "t_1", type: "MCQ", question: "2+2?", points: 2,
      hint: null, objectiveCode: null, options: ["3", "4"], correctIndex: 1,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.hint).toBeUndefined();
      expect(parsed.data.objectiveCode).toBeUndefined();
    }
  });
  it("preserves criterion links and teacher-only AI review flags", () => {
    const parsed = interactiveTaskSchema.safeParse({
      id: "t_review", type: "MCQ", question: "2+2?", points: 2,
      options: ["3", "4"], correctIndex: 1,
      criterionTexts: ["Объясняет вычисление"], aiGenerated: true, aiReviewed: false,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.criterionTexts).toEqual(["Объясняет вычисление"]);
      expect(parsed.data.aiGenerated).toBe(true);
      expect(parsed.data.aiReviewed).toBe(false);
    }
  });
  it("accepts AI MATCHING with shuffled right column and full pair coverage", () => {
    const parsed = interactiveTaskSchema.safeParse({
      id: "t_2", type: "MATCHING", question: "Соедини", points: 2,
      hint: null, objectiveCode: "5.1.2.1",
      left: ["Числитель", "Знаменатель"],
      right: ["Нижняя часть дроби", "Верхняя часть дроби"],
      pairs: [{ leftIndex: 0, rightIndex: 1 }, { leftIndex: 1, rightIndex: 0 }],
    });
    expect(parsed.success).toBe(true);
  });
  it("rejects MATCHING with incomplete coverage", () => {
    const parsed = interactiveTaskSchema.safeParse({
      id: "t_3", type: "MATCHING", question: "Соедини", points: 1,
      left: ["A", "B"], right: ["1", "2"],
      pairs: [{ leftIndex: 0, rightIndex: 0 }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("buildUserPrompt (tasks)", () => {
  it("teaches all 7 task types with objective binding", () => {
    const prompt = buildUserPrompt({ grade: 5, subject: "Математика", topic: "Дроби", language: "ru" });
    for (const t of ["MCQ", "TRUE_FALSE", "SHORT_ANSWER", "FILL_BLANK", "MATCHING", "NUMERIC", "ORDERING"]) {
      expect(prompt).toContain(t);
    }
    expect(prompt).toContain("objectiveCode");
  });
});
