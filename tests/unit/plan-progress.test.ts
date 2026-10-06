import { describe, expect, it } from "vitest";
import { computeProgress, collectWarnings } from "@/lib/ksp/plan-progress";
import { emptyKsp, type KspContent } from "@/lib/types/ksp";

/**
 * computeProgress считает процент заполненности КСП по 15 проверкам,
 * collectWarnings — человекочитаемый список недочётов. Обе функции чистые,
 * поэтому тестируются без моков и базы данных.
 */

function fullContent(): KspContent {
  const base = emptyKsp();
  return {
    ...base,
    topic: "Дроби",
    learningObjectives: [{ code: "5.1", text: "Сравнивать дроби" }],
    lessonObjectives: ["Цель урока"],
    assessmentCriteria: ["Критерий"],
    languageObjectives: { terms: ["числитель"], phrases: [] },
    values: "Уважение",
    priorKnowledge: "Целые числа",
    stages: {
      beginning: { ...base.stages.beginning, teacherActions: "Приветствие", tasks: [{ id: "t1", type: "MCQ", question: "Q", options: ["a", "b"], correctIndex: 0, points: 1 }] },
      middle: { ...base.stages.middle, teacherActions: "Объяснение" },
      end: { ...base.stages.end, teacherActions: "Подведение итогов" },
    },
    evaluation: {
      formativeAssessment: "Светофор",
      differentiation: "Дифф",
      healthAndSafety: "ТБ",
      reflection: "Рефлексия",
    },
  };
}

describe("computeProgress", () => {
  it("empty plan has 0% progress", () => {
    const p = computeProgress(emptyKsp(), "");
    expect(p).toEqual({ percent: 0, done: 0, total: 15 });
  });

  it("fully filled plan has 100% progress", () => {
    const p = computeProgress(fullContent(), "Название");
    expect(p).toEqual({ percent: 100, done: 15, total: 15 });
  });

  it("counts partial completion and rounds percent", () => {
    const c = fullContent();
    c.learningObjectives = []; // -1
    c.lessonObjectives = []; // -1
    c.assessmentCriteria = []; // -1
    const p = computeProgress(c, "Название");
    expect(p.done).toBe(12);
    expect(p.total).toBe(15);
    expect(p.percent).toBe(Math.round((12 / 15) * 100));
  });

  it("language objectives count when only phrases are filled", () => {
    const c = fullContent();
    c.languageObjectives = { terms: [], phrases: ["Фраза"] };
    expect(computeProgress(c, "Название").done).toBe(15);
    c.languageObjectives = { terms: [], phrases: [] };
    expect(computeProgress(c, "Название").done).toBe(14);
  });

  it("interactive tasks in any stage count as one check", () => {
    const c = fullContent();
    c.stages.beginning.tasks = [];
    c.stages.middle.tasks = [];
    c.stages.end.tasks = [];
    expect(computeProgress(c, "Название").done).toBe(14);
    c.stages.middle.tasks = [{ id: "t2", type: "MCQ", question: "Q", options: ["a", "b"], correctIndex: 0, points: 1 }];
    expect(computeProgress(c, "Название").done).toBe(15);
  });

  it("whitespace-only strings do not count as filled", () => {
    const c = fullContent();
    c.topic = "   ";
    c.values = "  ";
    expect(computeProgress(c, "  ").done).toBe(12);
  });

  it("missing stages object does not throw", () => {
    const c = { topic: "T" } as unknown as KspContent;
    const p = computeProgress(c, "T");
    expect(p.total).toBe(15);
    expect(p.done).toBe(2); // title + topic
  });
});

describe("collectWarnings", () => {
  it("returns no warnings for a complete plan", () => {
    expect(collectWarnings({ title: "Название", topic: "Тема", content: fullContent() })).toEqual([]);
  });

  it("reports every missing section", () => {
    const warnings = collectWarnings({ title: "", topic: "", content: emptyKsp() });
    expect(warnings).toContain("Название КСП не заполнено");
    expect(warnings).toContain("Тема урока не указана");
    expect(warnings).toContain("Нет целей обучения из ТУП");
    expect(warnings).toContain("Нет целей урока (SMART)");
    expect(warnings).toContain("Не заданы критерии оценивания");
    expect(warnings).toContain("Нет действий учителя ни в одном этапе урока");
    expect(warnings).toContain("Нет интерактивных заданий (добавьте хотя бы одно для вовлечения учеников)");
    expect(warnings).toContain("Не заполнен раздел «Здоровье и ТБ»");
  });

  it("does not warn about stages when at least one has teacher actions", () => {
    const c = emptyKsp();
    c.stages.middle.teacherActions = "Объяснение";
    const warnings = collectWarnings({ title: "Т", topic: "Тема", content: c });
    expect(warnings).not.toContain("Нет действий учителя ни в одном этапе урока");
  });

  it("does not warn about tasks when at least one exists", () => {
    const c = emptyKsp();
    c.stages.end.tasks = [{ id: "t", type: "MCQ", question: "Q", options: ["a", "b"], correctIndex: 0, points: 1 }];
    const warnings = collectWarnings({ title: "Т", topic: "Тема", content: c });
    expect(warnings).not.toContain("Нет интерактивных заданий (добавьте хотя бы одно для вовлечения учеников)");
  });

  it("tolerates a missing content object", () => {
    const warnings = collectWarnings({ title: "Т", topic: "Тема", content: undefined as unknown as KspContent });
    expect(warnings.length).toBeGreaterThan(0);
  });
});
