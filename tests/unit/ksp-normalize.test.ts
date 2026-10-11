/**
 * Нормализация ответа модели под схему КСП.
 *
 * Модели пишут списком или объектом там, где схема ждёт строку. Раньше такой
 * ответ отбрасывался целиком, и учитель оставался без урока из-за формы, а не
 * из-за содержания.
 */
import { describe, expect, it } from "vitest";
import { normalizeTextFields } from "@/lib/ai/generate";

describe("список там, где ждали строку", () => {
  it("teacherActions склеивается в строку", () => {
    const out = normalizeTextFields({
      stages: { beginning: { teacherActions: ["Проверить домашнее задание", "Объяснить правило"] } },
    });
    const value = out.stages.beginning.teacherActions;
    expect(typeof value).toBe("string");
    expect(value).toContain("Проверить домашнее задание");
    expect(value).toContain("Объяснить правило");
  });

  it("объект разворачивается в «ключ: значение»", () => {
    const out = normalizeTextFields({
      stages: { beginning: { resources: { textbook: "Математика 5", cards: "Дроби" } } },
    });
    expect(out.stages.beginning.resources).toBe("textbook: Математика 5; cards: Дроби");
  });

  it("вложенный список не теряется", () => {
    const out = normalizeTextFields({
      stages: { middle: { studentActions: [["Решить №1"], ["Решить №2"]] } },
    });
    expect(out.stages.middle.studentActions).toBe("Решить №1; Решить №2");
  });

  it("строка остаётся строкой", () => {
    const out = normalizeTextFields({ stages: { beginning: { teacherActions: "Обычный текст" } } });
    expect(out.stages.beginning.teacherActions).toBe("Обычный текст");
  });
});

describe("lessonObjectives остаётся массивом", () => {
  it("объекты разворачиваются в строки, но не склеиваются", () => {
    // Схема ждёт массив строк. Склейка в одну строку тихо ломала бы документ.
    const out = normalizeTextFields({
      lessonObjectives: [{ text: "Объяснить правило" }, { text: "Решить примеры" }],
    });
    expect(Array.isArray(out.lessonObjectives)).toBe(true);
    expect(out.lessonObjectives).toEqual(["Объяснить правило", "Решить примеры"]);
  });

  it("criteria objects become separate strings instead of rejecting the whole plan", () => {
    const out = normalizeTextFields({
      assessmentCriteria: [
        { text: "Определяет числитель и знаменатель" },
        { criterion: "Сравнивает дроби" },
      ],
    });
    expect(out.assessmentCriteria).toEqual([
      "Определяет числитель и знаменатель",
      "criterion: Сравнивает дроби",
    ]);
  });
});

describe("числовые поля", () => {
  it("строка превращается в число", () => {
    const out = normalizeTextFields({ stages: { middle: { tasks: [{ answer: "7" }] } } });
    expect(out.stages.middle.tasks[0].answer).toBe(7);
  });

  it("запятая как десятичный разделитель не ломает число", () => {
    const out = normalizeTextFields({ stages: { middle: { tasks: [{ answer: "7,5" }] } } });
    expect(out.stages.middle.tasks[0].answer).toBe(7.5);
  });

  it("нечисловой текст не выдумывается в ноль", () => {
    // «нет ответа» не должно превращаться в 0 — это выдуманные данные.
    const out = normalizeTextFields({ stages: { middle: { tasks: [{ answer: "нет" }] } } });
    expect(out.stages.middle.tasks[0].answer).toBe("нет");
  });
});

describe("содержание не выбрасывается", () => {
  it("answers переименовывается в answer для числового задания", () => {
    // Найдено живым отказом: схема требует `answer`, модель писала `answers`
    // — поле другого типа задания. Из-за имени отбрасывался весь урок.
    const out = normalizeTextFields<{ stages: { middle: { tasks: Array<Record<string, unknown>> } } }>({
      stages: { middle: { tasks: [{ answers: "7" }] } },
    });
    const task = out.stages.middle.tasks[0]!;
    expect(task.answer).toBe(7);
    expect("answers" in task).toBe(false);
  });

  it("answers-массив остаётся списком для задания на пропуск", () => {
    // `answers` у FILL_BLANK — массив подходящих ответов. Если переименовать
    // его в `answer`, у задания осталось бы одно число вместо всех вариантов.
    const out = normalizeTextFields<{ stages: { middle: { tasks: Array<Record<string, unknown>> } } }>({
      stages: { middle: { tasks: [{ answers: ["дробь", "7/8"] }] } },
    });
    const task = out.stages.middle.tasks[0]!;
    expect(task.answers).toEqual(["дробь", "7/8"]);
    expect(task.answer).toBeUndefined();
  });

  it("существующий answer не затирается переименованием", () => {
    const out = normalizeTextFields<{ stages: { middle: { tasks: Array<Record<string, unknown>> } } }>({
      stages: { middle: { tasks: [{ answer: 3, answers: "мусор" }] } },
    });
    expect(out.stages.middle.tasks[0]!.answer).toBe(3);
  });

  it("null и числа на месте не портятся", () => {
    const out = normalizeTextFields({
      stages: { middle: { tasks: [{ correctOrder: null, tolerance: 0.5 }] } },
    });
    expect(out.stages.middle.tasks[0].correctOrder).toBeNull();
    expect(out.stages.middle.tasks[0].tolerance).toBe(0.5);
  });

  it("неизвестные поля проходят без изменений", () => {
    const out = normalizeTextFields({ values: "Воспитание", somethingNew: { a: 1 } });
    expect(out.values).toBe("Воспитание");
    expect(out.somethingNew).toEqual({ a: 1 });
  });
});
