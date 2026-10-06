import { describe, it, expect } from "vitest";
import { buildLocalWorksheet } from "@/lib/handouts/local-worksheet";
import { enforceTenPoints } from "@/lib/handouts/generate";

const base = {
  kind: "worksheet" as const,
  subject: "Математика",
  grade: 7,
  language: "ru" as const,
};

/**
 * Локальный конструктор — последний рубеж перед 500, когда AI недоступен.
 * Проверяем контракт: валидный лист нужного объёма с суммой баллов 10.
 */
describe("buildLocalWorksheet", () => {
  const STAGE_RANK: Record<string, number> = { start: 0, middle: 1, end: 2 };
  it("собирает 5 заданий на 5", () => {
    const sheet = buildLocalWorksheet({ ...base, topic: "Дроби", count: 5 });
    expect(sheet.tasks).toHaveLength(5);
  });

  it("собирает 3 задания при count=3", () => {
    const sheet = buildLocalWorksheet({ ...base, topic: "Дроби", count: 3 });
    expect(sheet.tasks).toHaveLength(3);
  });

  it("не выходит за лимиты схемы при count > 10", () => {
    const sheet = buildLocalWorksheet({ ...base, topic: "Дроби", count: 30 });
    expect(sheet.tasks.length).toBeLessThanOrEqual(10);
    expect(sheet.tasks.length).toBeGreaterThanOrEqual(3);
  });

  it("сумма баллов оценочных заданий равна 10", () => {
    for (const count of [3, 5, 6, 8]) {
      const sheet = buildLocalWorksheet({ ...base, topic: "Дроби", count });
      const scored = sheet.tasks.filter((t) => t.type !== "reflection");
      const sum = scored.reduce((acc, t) => acc + t.points, 0);
      expect(sum, `count=${count}`).toBe(10);
    }
  });

  it("enforceTenPoints не ломает уже корректный лист", () => {
    const sheet = buildLocalWorksheet({ ...base, topic: "Дроби", count: 6 });
    const fixed = enforceTenPoints(sheet.tasks);
    const scored = fixed.filter((t) => t.type !== "reflection");
    expect(scored.reduce((acc, t) => acc + t.points, 0)).toBe(10);
  });

  it("идёт по этапам урока: start → middle → end", () => {
    // Регрессия: обязательные блоки (sort/reflection) собирались первыми,
    // из-за чего рефлексия (этап end) оказывалась вторым заданием, а
    // «Соедини пары» (этап start) — третьим.
    for (const count of [3, 5, 6, 8]) {
      const sheet = buildLocalWorksheet({ ...base, topic: "Дроби", count });
      const order = sheet.tasks.map((t) => t.stage ?? "");
      const ranks = order.map((stage) => STAGE_RANK[stage] ?? 0);
      const sorted = [...ranks].sort((a, b) => a - b);
      expect(ranks, `count=${count}: ${order.join(",")}`).toEqual(sorted);
    }
  });

  it("рефлексия идёт после всех обычных заданий", () => {
    const sheet = buildLocalWorksheet({ ...base, topic: "Дроби", count: 6 });
    const reflectionIndex = sheet.tasks.findIndex((t) => t.type === "reflection");
    expect(reflectionIndex).toBeGreaterThan(0);
    expect(reflectionIndex).toBe(sheet.tasks.length - 1);
  });

  it("reflectionOptions — строки, а не булевы значения", () => {
    // Раньше передавались [true, true, false], и в .docx печаталось
    // буквально «true / true / false».
    const sheet = buildLocalWorksheet({ ...base, topic: "Дроби", count: 5 });
    const reflection = sheet.tasks.find((t) => t.type === "reflection");
    expect(reflection).toBeDefined();
    const options = (reflection as { reflectionOptions?: unknown }).reflectionOptions;
    expect(Array.isArray(options)).toBe(true);
    for (const option of options as unknown[]) {
      expect(typeof option).toBe("string");
      expect(String(option).length).toBeGreaterThan(1);
    }
  });

  it("id заданий детерминированы (без Math.random)", () => {
    const first = buildLocalWorksheet({ ...base, topic: "Дроби", count: 5 });
    const second = buildLocalWorksheet({ ...base, topic: "Дроби", count: 5 });
    const idsOf = (sheet: typeof first) => JSON.stringify(sheet.tasks);
    expect(idsOf(first)).toBe(idsOf(second));
  });

  it("всегда содержит блок распределения (эталон листа)", () => {
    const sheet = buildLocalWorksheet({ ...base, topic: "Дроби", count: 5 });
    const sort = sheet.tasks.find((t) => t.type === "sort");
    expect(sort).toBeDefined();
    if (sort?.type === "sort") {
      expect(sort.groups).toHaveLength(2);
      expect(sort.items?.length ?? 0).toBeGreaterThanOrEqual(8);
    }
  });

  it("у каждого задания есть критерий и дескриптор", () => {
    const sheet = buildLocalWorksheet({ ...base, topic: "Дроби", count: 6 });
    for (const task of sheet.tasks) {
      expect(task.criterion).toBeTruthy();
      expect(task.descriptor).toBeTruthy();
      expect(task.prompt).toBeTruthy();
    }
  });

  it("match содержит пары, равные по длине options", () => {
    const sheet = buildLocalWorksheet({ ...base, topic: "Дроби", count: 6 });
    const match = sheet.tasks.find((t) => t.type === "match");
    if (match?.type === "match") {
      expect(match.pairs).toHaveLength(match.options?.length ?? 0);
      expect(match.expectedAnswer).toBeTruthy();
    }
  });

  it("казахская версия не содержит кириллических подсказок учителя", () => {
    const sheet = buildLocalWorksheet({ ...base, topic: "Дөңгелектер", language: "kz", count: 5 });
    expect(sheet.title).toContain("7-сынып");
    expect(sheet.metaLine).toContain("Оқушының");
    // служебные подписи на русском остаются в критериях — это ожидаемо,
    // но заголовок и шапка листа должны быть на казахском
    expect(sheet.title).not.toMatch(/класс/);
  });

  it("тема попадает в заголовок и в формулировки", () => {
    const sheet = buildLocalWorksheet({ ...base, topic: "Отрицательные числа", count: 5 });
    expect(sheet.title).toContain("Отрицательные числа");
    expect(sheet.intro).toContain("Отрицательные числа");
  });
});