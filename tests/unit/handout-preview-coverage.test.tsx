/**
 * Проверка полноты предпросмотра раздаточных.
 *
 * Предпросмотр и печать обязаны показывать одно и то же. Раньше пять типов
 * заданий печатались в .docx, но в предпросмотре для них возвращался `null`:
 * учитель видел заголовок задания с пустым телом и решал, что материал не
 * сгенерировался.
 */

// @vitest-environment jsdom
import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HandoutPreview } from "@/components/ksp/handout-preview";
import { splitMarkdownTable } from "@/components/ksp/print-sheet";
import type { FlashcardSet, Handout, Worksheet, WorksheetTask, WorksheetTaskType } from "@/lib/handouts/types";

/** Все типы заданий, которые умеет печатать .docx. */
const ALL_TYPES: WorksheetTaskType[] = [
  "open",
  "fill",
  "fill_bank",
  "sort",
  "checklist",
  "case_study",
  "multiple_choice",
  "true_false",
  "match",
  "table_fix",
  "scenario_fix",
  "choice_buttons",
  "reflection",
  "interactive",
  "creative",
  "word_search",
  "ordering",
  "odd_one_out",
  "categorize",
  "compare",
];

function taskOfType(type: WorksheetTaskType): WorksheetTask {
  return {
    type,
    stage: "middle",
    prompt: `Задание типа ${type}`,
    criterion: "Критерий",
    descriptor: "Дескриптор",
    points: 2,
    options: ["Первый вариант", "Второй вариант"],
    pairs: ["Первый вариант", "Второй вариант"],
    wordBank: ["Слово один", "Слово два"],
    items: ["Шаг первый", "Шаг второй", "Шаг третий"],
    groups: ["Группа 1", "Группа 2"],
    situation: "Ситуация для разбора",
    searchWords: ["ДРОБЬ", "ЧИСЛИТЕЛЬ"],
    orderItems: ["Первый", "Второй", "Третий"],
    oddItems: ["Один", "Два", "Три"],
    categories: ["Категория А", "Категория Б"],
    categoryItems: ["Элемент 1", "Элемент 2"],
    tableHeaders: ["Что не так", "Как исправить"],
    compareColumns: ["Критерий", "Первое", "Второе"],
    compareRows: ["Размер", "Цена"],
    choices: ["Кнопка 1", "Кнопка 2"],
    reflectionOptions: ["Понятно", "Вопросы", "Нужна помощь"],
    link: "https://example.com",
  } as WorksheetTask;
}

function sheetOfType(type: WorksheetTaskType): Worksheet {
  return {
    kind: "worksheet",
    language: "ru",
    title: "Рабочий лист",
    intro: "Проверьте задание перед печатью",
    metaLine: "",
    tasks: [taskOfType(type)],
  } as Worksheet;
}

/** Открытый предпросмотр: закрытый диалог прячет содержимое. */
function renderPreview(handout: Handout) {
  return render(<HandoutPreview handout={handout} onClose={() => {}} />);
}

describe("предпросмотр показывает все печатные типы заданий", () => {
  it.each(ALL_TYPES)("тип %s виден в предпросмотре", (type) => {
    renderPreview(sheetOfType(type));
    // Условие задания печатается в предпросмотре всегда, а вот тело —
    // раньше было пустым для пяти типов.
    expect(screen.getByText(`Задание типа ${type}`)).toBeTruthy();
    // Диалог рендерится порталом в document.body, поэтому ищем там, а не в
    // контейнере render: иначе проверка всегда находила бы пустоту.
    const body = document.body.querySelector("[data-task]");
    expect(body, `нет блока задания для типа ${type}`).toBeTruthy();
    // Пять элементов занимают шапка задания и очистка обтекания: остальное и есть тело.
    expect(body!.querySelectorAll("*").length, `тело пустое для типа ${type}`).toBeGreaterThan(5);
    cleanup();
  });
});

describe("предупреждение о материале без AI", () => {
  const cards: FlashcardSet = {
    kind: "flashcards",
    language: "ru",
    title: "Памятки",
    intro: "",
    degraded: true,
    cards: [{ front: "ДРОБЬ", back: "Число из числителя и знаменателя" }],
  };

  it("памятки без ИИ помечаются до печати", () => {
    renderPreview(cards);
    expect(screen.getByText(/ИИ сейчас недоступен/)).toBeTruthy();
    expect(screen.getByText(/собраны из слов темы/)).toBeTruthy();
    cleanup();
  });

  it("кроссворд без ИИ помечается до печати", () => {
    const puzzle = {
      kind: "crossword" as const,
      language: "ru" as const,
      title: "Кроссворд",
      intro: "",
      degraded: true,
      grid: [["А", null], ["Б", "В"]],
      numbers: [{ row: 0, col: 0, number: 1 }],
      placed: [
        { number: 1, direction: "across" as const, row: 0, col: 0, word: "А", clue: "Подсказка" },
      ],
      unplaced: [],
    };
    renderPreview(puzzle);
    expect(screen.getByText(/слова взяты из темы урока/)).toBeTruthy();
    cleanup();
  });

  it("полноценный материал не помечается как требующий уточнения", () => {
    renderPreview({ ...cards, degraded: false });
    expect(screen.queryByText(/ИИ сейчас недоступен/)).toBeNull();
    cleanup();
  });
});

describe("таблица в тексте задания", () => {
  it("показывается таблицей", () => {
    const parsed = splitMarkdownTable("Найди ошибки\n\n| Шаг | Решение |\n|---|---|\n| 1 | 6*8 |");
    expect(parsed).toEqual({ intro: "Найди ошибки", rows: [["Шаг", "Решение"], ["1", "6*8"]] });
  });

  it("обычный текст остаётся текстом", () => {
    expect(splitMarkdownTable("Вычисли: 1/4 + 2/4 = ____")).toBeNull();
  });
});
