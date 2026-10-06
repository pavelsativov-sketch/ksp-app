import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildKspPptx } from "@/lib/export/pptx";
import { emptyKsp, type LessonPlanRow } from "@/lib/types/ksp";
import type { InteractiveTask } from "@/lib/ksp/tasks";

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function makePlan(overrides: Partial<LessonPlanRow> = {}): LessonPlanRow {
  const ksp = emptyKsp();
  ksp.topic = "Сложение чисел";
  ksp.header = { ...ksp.header, school: "ОШ №1", teacherName: "Иванова И.И.", date: "2026-09-01" };
  ksp.lessonObjectives = ["Цель 1"];
  ksp.assessmentCriteria = ["Критерий 1"];
  ksp.languageObjectives = { terms: ["слагаемое"], phrases: ["Я считаю"] };
  ksp.stages.beginning.keyQuestions = ["Что вы помните?"];
  ksp.stages.end.homework = "Прочитать параграф";
  ksp.stages.end.summary = "Итог урока";
  ksp.stages.end.reflectionQuestions = ["Что узнали?"];
  return {
    id: "00000000-0000-0000-0000-000000000001",
    owner_id: "u",
    title: "Тест",
    subject_id: null,
    grade: 5,
    quarter: 1,
    section: null,
    content: ksp,
    visibility: "private",
    language: "ru",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

async function slideTexts(plan: LessonPlanRow, options?: { watermark?: boolean }): Promise<string[]> {
  const zip = await JSZip.loadAsync(await buildKspPptx(plan, options));
  const slides = await Promise.all(
    zip.file(/^ppt\/slides\/slide\d+\.xml$/).map((f) => f.async("string")),
  );
  return slides;
}

describe("buildKspPptx: водяной знак", () => {
  it("adds a watermark to every slide when requested", async () => {
    const slides = await slideTexts(makePlan(), { watermark: true });
    expect(slides.length).toBeGreaterThan(3);
    for (const xml of slides) {
      expect(xml).toContain("Создано в Mekty — бесплатный тариф");
    }
  });

  it("omits the watermark for Pro users", async () => {
    const slides = await slideTexts(makePlan(), { watermark: false });
    for (const xml of slides) {
      expect(xml).not.toContain("Создано в Mekty");
    }
  });
});

describe("buildKspPptx: типы заданий", () => {
  const task = (overrides: Partial<InteractiveTask>): InteractiveTask => ({
    id: "t1", type: "MCQ", question: "Вопрос?", points: 1, ...overrides,
  }) as InteractiveTask;

  it.each([
    ["MCQ", { type: "MCQ" as const, options: ["а", "б", "в", "г"], correctIndex: 1 }],
    ["TRUE_FALSE", { type: "TRUE_FALSE" as const }],
    ["FILL_BLANK", { type: "FILL_BLANK" as const, template: "___ + 2 = 5" }],
    ["MATCHING", { type: "MATCHING" as const, left: ["1", "2"], right: ["а", "б"] }],
    ["ORDERING", { type: "ORDERING" as const, items: ["первый", "второй"] }],
    ["NUMERIC", { type: "NUMERIC" as const, unit: "кг" }],
    ["SHORT_ANSWER", { type: "SHORT_ANSWER" as const }],
  ])("renders a slide for task type %s", async (type, overrides) => {
    const plan = makePlan();
    plan.content.stages.beginning.tasks = [task(overrides)];
    const slides = await slideTexts(plan);
    const all = slides.join("\n");
    expect(all).toContain("Вопрос?");
    expect(all).toContain("Задание");
  });

  it("shows a hint when the task has one", async () => {
    const plan = makePlan();
    plan.content.stages.beginning.tasks = [task({ type: "MCQ", options: ["а", "б"], correctIndex: 0, hint: "посчитайте" })];
    const slides = await slideTexts(plan);
    const all = slides.join("\n");
    expect(all).toContain("Подсказка");
    expect(all).toContain("посчитайте");
  });
});

describe("buildKspPptx: устойчивость", () => {
  it("builds a valid pptx for a minimal plan", async () => {
    const buf = await buildKspPptx(makePlan());
    expect(buf.length).toBeGreaterThan(5000);
    expect(buf.subarray(0, 4).equals(ZIP_MAGIC)).toBe(true);
  });

  it("builds a valid pptx for an empty plan", async () => {
    const plan = makePlan();
    plan.content = emptyKsp();
    const buf = await buildKspPptx(plan);
    expect(buf.subarray(0, 4).equals(ZIP_MAGIC)).toBe(true);
  });

  it("includes the long-term plan section in the subject line", async () => {
    const plan = makePlan();
    plan.content.header.longTermPlanSection = "Раздел 5.1";
    const slides = await slideTexts(plan);
    expect(slides.join("\n")).toContain("Раздел 5.1");
  });

  it("shows the summary on the final slide", async () => {
    const slides = await slideTexts(makePlan());
    const last = slides[slides.length - 1];
    expect(last).toContain("Спасибо за урок!");
    expect(last).toContain("Итог урока");
  });
});
