import { describe, it, expect } from "vitest";
import {
  computeAnswerScore,
  correctSummary,
  generateRoomCode,
  generateStudentId,
  speedBonus,
  toPublicTask,
} from "@/lib/ksp/live-quiz";
import type { McqTask, MatchingTask, OrderingTask } from "@/lib/ksp/tasks";

describe("live-quiz helpers", () => {
  it("generateRoomCode returns a 6-digit string", () => {
    for (let i = 0; i < 100; i++) {
      const c = generateRoomCode();
      expect(c).toMatch(/^\d{6}$/);
      expect(Number(c)).toBeGreaterThanOrEqual(100000);
    }
  });

  it("generateStudentId is unique-ish", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(generateStudentId());
    expect(seen.size).toBe(50);
  });

  it("speedBonus ranges from 1.0 (timed out) to 1.5 (instant)", () => {
    expect(speedBonus(0, 30)).toBeCloseTo(1.5);
    expect(speedBonus(30_000, 30)).toBeCloseTo(1.0);
    expect(speedBonus(15_000, 30)).toBeCloseTo(1.25);
    expect(speedBonus(60_000, 30)).toBe(1.0); // clamped
  });

  it("computeAnswerScore applies the speed bonus only to correct answers", () => {
    const correct = { isCorrect: true, score: 10 };
    const wrong = { isCorrect: false, score: 10 };
    expect(computeAnswerScore(correct, 0, 30)).toBe(15); // мгновенно: ×1.5
    expect(computeAnswerScore(correct, 30_000, 30)).toBe(10); // таймаут: ×1.0
    expect(computeAnswerScore(correct, 15_000, 30)).toBe(13); // 12.5 → округляется
    expect(computeAnswerScore(correct, 60_000, 30)).toBe(10); // отрицательное время зажимается
    expect(computeAnswerScore(correct, -5_000, 30)).toBe(15); // ms < 0 → 0
    expect(computeAnswerScore(wrong, 0, 30)).toBe(10); // неверный ответ — без бонуса
  });

  it("toPublicTask strips secret fields from MCQ", () => {
    const task: McqTask = {
      id: "1",
      type: "MCQ",
      question: "Q",
      points: 1,
      options: ["a", "b", "c"],
      correctIndex: 2,
      aiGenerated: true,
      aiReviewed: false,
    };
    const pub = toPublicTask(task) as Extract<ReturnType<typeof toPublicTask>, { type: "MCQ" }>;
    expect(pub.options).toEqual(["a", "b", "c"]);
    expect("correctIndex" in pub).toBe(false);
    expect("aiGenerated" in pub).toBe(false);
    expect("aiReviewed" in pub).toBe(false);
  });

  it("toPublicTask strips secret fields from MATCHING and ORDERING", () => {
    const m: MatchingTask = {
      id: "1",
      type: "MATCHING",
      question: "",
      points: 1,
      left: ["A", "B"],
      right: ["1", "2"],
      pairs: [
        { leftIndex: 0, rightIndex: 0 },
        { leftIndex: 1, rightIndex: 1 },
      ],
    };
    const pubM = toPublicTask(m);
    expect("pairs" in pubM).toBe(false);

    const o: OrderingTask = {
      id: "1",
      type: "ORDERING",
      question: "",
      points: 1,
      items: ["x", "y"],
      correctOrder: [1, 0],
    };
    const pubO = toPublicTask(o);
    expect("correctOrder" in pubO).toBe(false);
  });

  it("correctSummary describes the correct answer in Russian", () => {
    expect(
      correctSummary({
        id: "1",
        type: "MCQ",
        question: "",
        points: 1,
        options: ["a", "b"],
        correctIndex: 0,
      }),
    ).toContain("«a»");
    expect(
      correctSummary({
        id: "1",
        type: "TRUE_FALSE",
        question: "",
        points: 1,
        correct: false,
      }),
    ).toMatch(/неверно/i);
  });
});
