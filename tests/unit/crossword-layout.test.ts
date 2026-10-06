import { describe, expect, it } from "vitest";
import { layoutCrossword } from "@/lib/handouts/crossword";
import type { CrosswordWord } from "@/lib/handouts/types";

/**
 * Раскладка кроссворда: нормализация слов, непоместившиеся слова и
 * корректность нумерации. Базовый путь покрыт handouts.test.ts.
 */

describe("layoutCrossword: нормализация", () => {
  it("uppercases words and strips spaces, hyphens and punctuation", () => {
    const c = layoutCrossword(
      [{ word: " с-л.о,в'о ", clue: "часть речи" }],
      "T", "i",
    );
    expect(c.placed).toHaveLength(1);
    expect(c.placed[0].word).toBe("СЛОВО");
  });

  it("filters out single-letter words and words without a clue", () => {
    const c = layoutCrossword(
      [
        { word: "я", clue: "буква" },
        { word: "слово", clue: "" },
        { word: "  ", clue: "пробел" },
        { word: "норм", clue: "ок" },
      ],
      "T", "i",
    );
    expect(c.placed).toHaveLength(1);
    expect(c.placed[0].word).toBe("НОРМ");
    expect(c.unplaced).toEqual([]);
  });

  it("returns an empty layout for no valid words", () => {
    const c = layoutCrossword([{ word: "я", clue: "буква" }], "T", "i");
    expect(c.grid).toEqual([]);
    expect(c.placed).toEqual([]);
    expect(c.unplaced).toEqual([]);
  });
});

describe("layoutCrossword: непоместившиеся слова", () => {
  it("tracks words that could not intersect with the grid", () => {
    // "зззз" не пересекается ни с одним размещённым словом по букве.
    const c = layoutCrossword(
      [
        { word: "СЛОВО", clue: "часть речи" },
        { word: "ЗЗЗЗ", clue: "зубы" },
      ],
      "T", "i",
    );
    expect(c.placed.map((w) => w.word)).toContain("СЛОВО");
    expect(c.unplaced.map((w) => w.word)).toContain("ЗЗЗЗ");
  });

  it("places intersecting words perpendicular to the first word", () => {
    const c = layoutCrossword(
      [
        { word: "СЛОВО", clue: "часть речи" },
        { word: "ОСЬ", clue: "линия" },
      ],
      "T", "i",
    );
    expect(c.placed).toHaveLength(2);
    const second = c.placed.find((w) => w.word === "ОСЬ");
    expect(second).toBeDefined();
    // Первое слово горизонтально — второе обязано быть вертикально.
    expect(second?.direction).toBe("down");
  });
});

describe("layoutCrossword: нумерация", () => {
  it("numbers start cells in reading order and assigns numbers to placed words", () => {
    const c = layoutCrossword(
      [
        { word: "СЛОВО", clue: "часть речи" },
        { word: "ОСЬ", clue: "линия" },
        { word: "СОН", clue: "отдых" },
      ],
      "T", "i",
    );
    // Номера монотонно возрастают и ссылаются на уникальные ячейки.
    const numbers = c.numbers.map((n) => n.number);
    expect([...new Set(numbers)]).toHaveLength(numbers.length);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    // Каждое размещённое слово получает номер из списка.
    for (const w of c.placed) {
      expect(w.number).toBeGreaterThan(0);
      const cell = c.numbers.find((n) => n.row === w.row && n.col === w.col);
      expect(cell?.number).toBe(w.number);
    }
  });

  it("trims empty borders from the grid", () => {
    const c = layoutCrossword(
      [{ word: "СЛОВО", clue: "часть речи" }],
      "T", "i",
    );
    // Сетка не должна содержать пустых строк/столбцов по краям.
    for (const row of c.grid) {
      expect(row.some((cell) => cell !== null)).toBe(true);
    }
    for (let col = 0; col < c.grid[0].length; col++) {
      expect(c.grid.some((row) => row[col] !== null)).toBe(true);
    }
  });

  it("keeps title and intro in the result", () => {
    const c = layoutCrossword([{ word: "СЛОВО", clue: "часть речи" }], "Мой кроссворд", "Вступление");
    expect(c.title).toBe("Мой кроссворд");
    expect(c.intro).toBe("Вступление");
    expect(c.kind).toBe("crossword");
  });
});

describe("layoutCrossword: устойчивость", () => {
  it("handles a large number of words without throwing", () => {
    const words: CrosswordWord[] = Array.from({ length: 30 }, (_, i) => ({
      word: `СЛОВО${i}`,
      clue: `Подсказка ${i}`,
    }));
    const c = layoutCrossword(words, "T", "i");
    expect(c.placed.length).toBeGreaterThan(0);
    expect(c.placed.length + c.unplaced.length).toBe(30);
  });

  it("does not mutate the input words", () => {
    const words: CrosswordWord[] = [{ word: "СЛОВО", clue: "часть речи" }];
    const before = structuredClone(words);
    layoutCrossword(words, "T", "i");
    expect(words).toEqual(before);
  });
});
