import { describe, it, expect } from "vitest";
import { flattenTasks, buildInteractiveHtml, buildReadme } from "@/lib/export/html";
import type { LessonPlanRow } from "@/lib/types/ksp";

/**
 * Офлайн-HTML экспорт (src/lib/export/html.ts) не был покрыт тестами вовсе,
 * хотя это 950+ строк с собственным рантаймом оценки ответов.
 */

function makePlan(overrides: Partial<LessonPlanRow["content"]> = {}): LessonPlanRow {
  return {
    id: "a".repeat(24),
    title: "Дроби",
    grade: 5,
    subject_id: null,
    owner_id: "b".repeat(24),
    language: "ru",
    visibility: "private",
    content: {
      topic: "Дроби и их виды",
      header: { school: "Школа №1", teacher: "Иванова А. А.", year: "2026" },
      learningObjectives: ["5.1.2.1 — Объяснять смысл дроби"],
      stages: {
        beginning: {
          teacherActions: "Приветствует класс",
          studentActions: "Настраиваются на работу",
          time: "2 мин",
          keyQuestions: ["Что мы уже знаем о дробях?"],
          tasks: [
            { id: "t1", type: "MCQ", question: "Что такое дробь?", options: ["Часть целого", "Целое число", "Вид числа"], answer: 0, points: 2 },
          ],
          resources: "—",
          descriptors: ["Называет термин"],
        },
        middle: {
          teacherActions: "Объясняет материал",
          studentActions: "Решают задания",
          time: "20 мин",
          keyQuestions: [],
          tasks: [
            { id: "t2", type: "TRUE_FALSE", question: "Дробь бывает improper", answer: true, points: 2 },
            { id: "t3", type: "SHORT_ANSWER", question: "Что такое числитель?", answer: "верхняя часть дроби", points: 2 },
          ],
          resources: "Учебник",
          descriptors: [],
        },
        end: {
          teacherActions: "Подводит итоги",
          studentActions: "Выполняют рефлексию",
          time: "3 мин",
          keyQuestions: [],
          tasks: [
            { id: "t4", type: "FILL_BLANK", question: "Дробь {{1}}/2 называется половиной", answer: ["одна"], points: 2 },
          ],
          resources: "—",
          descriptors: [],
        },
      },
      assessmentCriteria: ["Верно определяет дробь"],
      languageObjectives: { terms: ["дробь"], keyPhrases: [] },
      reflection: "",
      homework: "Выучить определения",
      values: ["Уважение"],
      differentiation: "",
      ...overrides,
    },
  } as unknown as LessonPlanRow;
}

describe("flattenTasks", () => {
  it("собирает задания всех этапов в порядке урока с человеческими названиями", () => {
    const flat = flattenTasks(makePlan());
    expect(flat.map((f) => f.task.id)).toEqual(["t1", "t2", "t3", "t4"]);
    expect(flat.map((f) => f.stageTitle)).toEqual([
      "Начало урока",
      "Середина урока",
      "Середина урока",
      "Конец урока",
    ]);
  });

  it("этап без заданий не ломает разборку", () => {
    const plan = makePlan();
    plan.content.stages.end.tasks = undefined as never;
    const flat = flattenTasks(plan);
    expect(flat).toHaveLength(3);
  });
});

describe("buildInteractiveHtml", () => {
  const html = buildInteractiveHtml(makePlan());

  it("отдаёт самодостаточный документ с встроенными данными", () => {
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("window.__KSP_DATA__");
    expect(html).toContain("Дроби и их виды");
  });

  it("нумерует задания по порядку", () => {
    expect(html).toContain('"n":1');
    expect(html).toContain('"n":4');
  });

  it("ватермарка появляется только когда её просят", () => {
    expect(buildInteractiveHtml(makePlan(), { watermark: false })).not.toContain("бесплатный тариф");
    expect(buildInteractiveHtml(makePlan(), { watermark: true })).toContain("бесплатный тариф");
  });

  // Главный риск офлайн-файла: payload вставляется в <script>, поэтому любые
  // символы, способные закрыть тег или сломать парсер, должны быть экранированы.
  it("экранирует полезную нагрузку, чтобы данные не вырвались из <script>", () => {
    const evil = makePlan();
    evil.content.topic = '</script><script>alert(1)</script>';
    evil.content.stages.beginning.tasks![0].question = "]]><!-- <img onerror=alert(1)>";
    const out = buildInteractiveHtml(evil);
    // Ни одна инъекция не должна закрыть тег данных.
    expect(out).not.toContain("</script><script>alert(1)");
    expect(out).not.toContain("<img onerror=alert(1)>");
    expect(out).toContain("\\u003c");
  });

  it("экранирует текст в разметке", () => {
    const plan = makePlan();
    plan.content.topic = "<b>жирный</b>";
    const out = buildInteractiveHtml(plan);
    expect(out).not.toContain("<b>жирный</b>");
  });
});

describe("buildReadme", () => {
  it("объясняет, как открыть файл, и не содержит сырых секретов", () => {
    const readme = buildReadme(makePlan());
    expect(readme.length).toBeGreaterThan(0);
    expect(readme).not.toMatch(/OPENAI_API_KEY\s*=\s*\S/);
  });
});
