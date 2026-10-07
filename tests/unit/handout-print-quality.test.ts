/**
 * Проверка качества печати раздаточных: DOCX собирается и разбирается.
 *
 * Не эталонный снимок, а проверка свойств, которые ломают печать: ширина
 * таблицы (кроссворд обязан влезать на полосу набора), отсутствие разрывов
 * строк (cantSplit), наличие слов в сетке поиска, цветные рамки карточек.
 */

import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { buildHandoutDocx } from "@/lib/handouts/docx";
import { layoutCrossword } from "@/lib/handouts/crossword";
import { buildLocalCrossword, buildLocalFlashcards } from "@/lib/handouts/local-flashcards";
import { buildWordSearchGrid, containsWord } from "@/lib/handouts/word-search";
import type { Crossword, FlashcardSet, HandoutInput, Worksheet } from "@/lib/handouts/types";

async function xmlOf(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("нет word/document.xml");
  return await file.async("string");
}

const baseInput: HandoutInput = {
  kind: "worksheet",
  topic: "Дроби и их виды",
  subject: "Математика",
  grade: 5,
  language: "ru",
  count: 4,
};

function makeCrossword(words: string[]): Crossword {
  const laid = layoutCrossword(
    words.map((word) => ({ word, clue: `Подсказка: ${word}` })),
    "Кроссворд: Дроби",
    "Разгадайте слова.",
  );
  return { ...laid, language: "ru" };
}

describe("печать кроссворда", () => {
  it("сетка влезает на полосу набора при любом числе слов", async () => {
    const words = ["ДРОБЬ", "ЧИСЛИТЕЛЬ", "ЗНАМЕНАТЕЛЬ", "ОБЫКНОВЕННАЯ", "СМЕШАННАЯ", "ЦЕЛАЯ"];
    for (const count of [3, 5, 8, 12, 16, 20]) {
      const crossword = makeCrossword([...words, ...words].slice(0, count));
      const xml = await xmlOf(await buildHandoutDocx(crossword));
      const cols = crossword.grid[0]?.length ?? 0;

      // Ячейки сетки получают процентную ширину, таблица — 100%. Именно
      // фиксированная ширина в DXA выносила сетку за поле набора.
      expect(xml, `${count} слов`).toContain('w:type="pct"');
      expect(xml, `${count} слов`).not.toContain('w:type="dxa" w:w="600"');
      // При 18 колонках ячейка — около 1.6 см: номер и буква помещаются.
      expect(cols, `${count} слов → колонок`).toBeLessThanOrEqual(18);
    }
  });

  it("строки сетки не разрываются между страницами", async () => {
    const xml = await xmlOf(await buildHandoutDocx(makeCrossword(["ДРОБЬ", "ЧИСЛИТЕЛЬ", "ЗНАМЕНАТЕЛЬ"])));
    expect(xml).toContain("<w:cantSplit/>");
  });
});

describe("поиск слов", () => {
  it("в сетку попадают все слова, а не часть", () => {
    const words = ["ДРОБЬ", "ЧИСЛИТЕЛЬ", "ЗНАМЕНАТЕЛЬ", "ОБЫКНОВЕННАЯ", "СМЕШАННАЯ"];
    const grid = buildWordSearchGrid(words);
    for (const word of words) {
      expect(containsWord(grid, word), `слово ${word} должно быть в сетке`).toBe(true);
    }
    expect(grid.dropped).toEqual([]);
  });

  it("сетка детерминирована: два рендера совпадают", () => {
    const words = ["ДРОБЬ", "ЧИСЛИТЕЛЬ", "ЗНАМЕНАТЕЛЬ"];
    expect(buildWordSearchGrid(words).cells).toEqual(buildWordSearchGrid(words).cells);
  });

  it("в сетке есть казахские буквы", () => {
    const grid = buildWordSearchGrid(["ӘЖЕЛЕ", "ҚЫЗЫҚ"]);
    expect(/[ӘҒҚҢӨҰҮҺІ]/.test(grid.cells.flat().join(""))).toBe(true);
  });

  it("пустой список слов всё равно даёт поле", () => {
    const grid = buildWordSearchGrid([]);
    expect(grid.size).toBeGreaterThan(0);
    expect(grid.cells.every((row) => row.length === grid.size)).toBe(true);
  });

  it("слово длиннее сетки не выпадает молча", () => {
    const grid = buildWordSearchGrid(["СВЕРХДЛИННОЕСЛОВОКОТОРОЕОНЕНОМЕСТИТСЯ"]);
    expect(grid.dropped).toEqual(["СВЕРХДЛИННОЕСЛОВОКОТОРОЕОНЕНОМЕСТИТСЯ"]);
  });

  it("поле печатается и не разрывается", async () => {
    const worksheet: Worksheet = {
      kind: "worksheet",
      language: "ru",
      title: "Поиск слов",
      intro: "",
      metaLine: "",
      tasks: [
        {
          type: "word_search",
          stage: "start",
          prompt: "Найдите слова",
          criterion: "",
          descriptor: "",
          points: 10,
          words: ["ДРОБЬ", "ЧИСЛИТЕЛЬ"],
        } as never,
      ],
    };
    const xml = await xmlOf(await buildHandoutDocx(worksheet));
    expect(xml).toContain("<w:cantSplit/>");
    expect(xml).toContain('w:type="pct"');
  });
});

describe("печать памяток", () => {
  const set: FlashcardSet = {
    kind: "flashcards",
    language: "ru",
    title: "Памятки по теме",
    intro: "Карточки",
    cards: [
      { front: "ДРОБЬ", back: "Число из числителя и знаменателя", example: "3/4", checkQuestion: "Что такое дробь?" },
      { front: "ЧИСЛИТЕЛЬ", back: "Верхняя часть дроби", example: "3 в 3/4", checkQuestion: "Где числитель?" },
      { front: "ЗНАМЕНАТЕЛЬ", back: "Нижняя часть дроби", example: "4 в 3/4", checkQuestion: "Где знаменатель?" },
      { front: "ЦЕЛАЯ", back: "Дробь без знаменателя", example: "5", checkQuestion: "Что значит целая?" },
    ],
  };

  it("карточки оформлены цветом, а не серым прямоугольником", async () => {
    const xml = await xmlOf(await buildHandoutDocx(set));
    // Четыре схемы рамки: набор читается как серия разных карточек.
    for (const color of ["2B6CB0", "2F855A", "B7791F", "9B2C2C"]) {
      expect(xml, `рамка ${color}`).toContain(color.toUpperCase());
    }
    // Заливки баннера и «оборота» карточки.
    for (const fill of ["DEEBF7", "E2EFDA", "FFF2CC", "FBE4E4"]) {
      expect(xml, `заливка ${fill}`).toContain(fill);
    }
  });

  it("карточка не разрывается между страницами", async () => {
    const xml = await xmlOf(await buildHandoutDocx(set));
    expect(xml).toContain("<w:cantSplit/>");
  });

  it("у памяток есть оформленный заголовок, как у рабочего листа", async () => {
    const xml = await xmlOf(await buildHandoutDocx(set));
    // Раньше заголовок был пустым абзацем без размера и цвета.
    expect(xml).toContain("ПАМЯТКИ");
    expect(xml).toMatch(/w:sz w:val="60"|<w:sz w:val="30"/);
  });

  it("карточки не содержат ключей для ученика", async () => {
    const xml = await xmlOf(await buildHandoutDocx(set));
    expect(xml).not.toContain("Ответы для учителя");
  });
});

describe("материалы без AI", () => {
  it("памятки собираются по словам темы и помечаются как требующие уточнения", () => {
    const set = buildLocalFlashcards({ ...baseInput, kind: "flashcards", count: 6 });
    expect(set.cards).toHaveLength(6);
    expect(set.degraded).toBe(true);
    for (const card of set.cards) {
      expect(card.front.length).toBeGreaterThan(0);
      expect(card.back.length).toBeGreaterThan(0);
      expect(card.checkQuestion?.length).toBeGreaterThan(0);
    }
  });

  it("кроссворд собирается по словам темы и раскладывается", () => {
    const crossword = buildLocalCrossword({ ...baseInput, kind: "crossword", count: 8 });
    expect(crossword.grid.length).toBeGreaterThan(0);
    expect(crossword.placed.length).toBeGreaterThanOrEqual(3);
    expect(crossword.degraded).toBe(true);
  });

  it("кроссворд из слов целей урока содержит эти слова", () => {
    const crossword = buildLocalCrossword({
      ...baseInput,
      kind: "crossword",
      count: 6,
      kspContext: {
        learningObjectives: ["Объяснить понятие дроби", "Сравнить дроби с разными знаменателями"],
        assessmentCriteria: [],
        stages: [],
      },
    });
    const placed = crossword.placed.map((w) => w.word);
    expect(placed.some((w) => w.includes("ДРОБ"))).toBe(true);
  });

  it("пустой кроссворд честно сообщает, что слов не хватило", () => {
    // Тема без слов длиной от 3 букв → собрать нечего. Предмет тоже пуст:
    // иначе в слова попали бы слова предмета, и задание собралось бы вопреки
    // ожиданию.
    const crossword = buildLocalCrossword({
      ...baseInput,
      kind: "crossword",
      topic: "А а",
      subject: "",
      count: 5,
    });
    expect(crossword.grid).toHaveLength(0);
    expect(crossword.degraded).toBe(true);
  });
});
