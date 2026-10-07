import type { Crossword, CrosswordWord } from "./types";

/**
 * Улучшенная раскладка кроссворда.
 *
 * Алгоритм:
 *  1. Слова сортируем по убыванию длины.
 *  2. Самое длинное кладём горизонтально по центру.
 *  3. Каждое следующее пытаемся положить так, чтобы оно пересекалось
 *     с уже размещённым по совпадающей букве, под прямым углом.
 *  4. Если не нашлось пересечения — слово пропускается (попадает в `unplaced`).
 *  5. Генерируем ключ решения с заполненными буквами.
 *
 * Поддерживает настраиваемый размер сетки и улучшенный алгоритм размещения
 * с попыткой нескольких вариантов для каждого слова.
 */
export function layoutCrossword(
  words: CrosswordWord[],
  title: string,
  intro: string,
  gridSize?: number,
): Crossword {
  const cleaned = words
    .map((w) => ({
      word: normalize(w.word),
      clue: w.clue.trim(),
    }))
    .filter((w) => w.word.length >= 2 && w.clue.length > 0);

  // Sort: longest first.
  cleaned.sort((a, b) => b.word.length - a.word.length);

  // Размер сетки ограничен сверху: кроссворд должен помещаться на листе
  // А4 и оставаться читаемым. При 30 колонках ячейка выходила уже 1 см, а
  // сетка — шире полосы набора, и Word переносил её на следующую страницу или
  // обрезал. 18 колонок дают ячейку ~1.6 см: цифра номера и буква помещаются,
  // а учитель может от руки обвести найденное слово.
  const SIZE = gridSize ?? Math.max(12, Math.min(18, cleaned.length * 2 + 4));
  const grid: (string | null)[][] = Array.from({ length: SIZE }, () =>
    Array<string | null>(SIZE).fill(null),
  );
  const placed: Crossword["placed"] = [];
  const unplaced: CrosswordWord[] = [];

  if (cleaned.length === 0) {
    return {
      kind: "crossword",
      title,
      intro,
      grid: [],
      numbers: [],
      placed: [],
      unplaced: [],
      gridSize: SIZE,
    };
  }

  // Place first word horizontally in the centre.
  const first = cleaned[0];
  const firstRow = Math.floor(SIZE / 2);
  const firstCol = Math.floor((SIZE - first.word.length) / 2);
  for (let i = 0; i < first.word.length; i++) {
    grid[firstRow][firstCol + i] = first.word[i];
  }
  placed.push({
    number: 1,
    direction: "across",
    row: firstRow,
    col: firstCol,
    word: first.word,
    clue: first.clue,
  });

  // Try to place each subsequent word with at least one intersection.
  // Улучшенный алгоритм: пробуем несколько вариантов и выбираем лучший.
  for (let wi = 1; wi < cleaned.length; wi++) {
    const w = cleaned[wi];
    const placement = findBestPlacement(grid, w.word, SIZE);
    if (!placement) {
      unplaced.push(w);
      continue;
    }
    const { row, col, direction } = placement;
    for (let i = 0; i < w.word.length; i++) {
      const r = direction === "across" ? row : row + i;
      const c = direction === "across" ? col + i : col;
      grid[r][c] = w.word[i];
    }
    placed.push({
      number: 0, // numbered later
      direction,
      row,
      col,
      word: w.word,
      clue: w.clue,
    });
  }

  // Trim empty borders to make a tight grid.
  const { trimmed, dRow, dCol } = trim(grid);
  for (const p of placed) {
    p.row -= dRow;
    p.col -= dCol;
  }

  // Number cells: scan in reading order; a cell gets a new number if it's the
  // start of any placed word.
  const startKey = (r: number, c: number) => `${r},${c}`;
  const startsHere = new Set(placed.map((p) => startKey(p.row, p.col)));
  let counter = 0;
  const numbers: Crossword["numbers"] = [];
  for (let r = 0; r < trimmed.length; r++) {
    for (let c = 0; c < trimmed[0].length; c++) {
      if (trimmed[r][c] !== null && startsHere.has(startKey(r, c))) {
        counter++;
        numbers.push({ row: r, col: c, number: counter });
      }
    }
  }
  // Assign numbers to placed words in sorted (row, col) order, by direction.
  placed.sort((a, b) => (a.row - b.row) || (a.col - b.col) || (a.direction === "across" ? -1 : 1));
  for (const p of placed) {
    const num = numbers.find((n) => n.row === p.row && n.col === p.col);
    p.number = num ? num.number : 0;
  }

  // Generate solution key
  const solution: string[][] = trimmed.map((row) =>
    row.map((cell) => cell ?? ""),
  );

  return {
    kind: "crossword",
    title,
    intro,
    grid: trimmed,
    numbers,
    placed,
    unplaced,
    gridSize: SIZE,
    solution,
  };
}

function normalize(s: string): string {
  return s.toLocaleUpperCase("ru-RU").replace(/[\s\-—.,'`]/g, "");
}

interface Placement {
  row: number;
  col: number;
  direction: "across" | "down";
}

/**
 * Первое подходящее размещение через пересечение с уже стоящим словом.
 *
 * Оставлено как эталон для `findBestPlacement`: он перебирает варианты и
 * выбирает лучший по числу пересечений, а этот возвращает первый попавшийся.
 * Используется в тестах, чтобы проверить границы `fits()`.
 */
export function findPlacement(
  grid: (string | null)[][],
  word: string,
  size: number,
): Placement | null {
  // Iterate over each existing letter on the grid; if the new word contains
  // that letter, try to place it perpendicularly through that intersection.
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const ch = grid[r][c];
      if (!ch) continue;
      for (let i = 0; i < word.length; i++) {
        if (word[i] !== ch) continue;
        // Try perpendicular: if cell is part of an across word, place down.
        // We don't precisely know cell direction, so try both — fits() rejects bad ones.
        for (const dir of ["across", "down"] as const) {
          const row = dir === "across" ? r : r - i;
          const col = dir === "across" ? c - i : c;
          if (fits(grid, word, row, col, dir, size)) {
            return { row, col, direction: dir };
          }
        }
      }
    }
  }
  return null;
}

/**
 * Улучшенный алгоритм размещения: пробуем все возможные варианты и выбираем
 * тот, который даёт больше пересечений и лучше заполняет сетку.
 */
function findBestPlacement(
  grid: (string | null)[][],
  word: string,
  size: number,
): Placement | null {
  let best: Placement | null = null;
  let bestScore = -1;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const ch = grid[r][c];
      if (!ch) continue;
      for (let i = 0; i < word.length; i++) {
        if (word[i] !== ch) continue;
        for (const dir of ["across", "down"] as const) {
          const row = dir === "across" ? r : r - i;
          const col = dir === "across" ? c - i : c;
          if (fits(grid, word, row, col, dir, size)) {
            const score = scorePlacement(grid, word, row, col, dir, size);
            if (score > bestScore) {
              bestScore = score;
              best = { row, col, direction: dir };
            }
          }
        }
      }
    }
  }
  return best;
}

/** Оценка размещения: чем больше пересечений и плотнее сетка, тем лучше. */
function scorePlacement(
  grid: (string | null)[][],
  word: string,
  row: number,
  col: number,
  dir: "across" | "down",
  size: number,
): number {
  let score = 0;
  for (let i = 0; i < word.length; i++) {
    const r = dir === "across" ? row : row + i;
    const c = dir === "across" ? col + i : col;
    if (grid[r][c] === word[i]) {
      score += 10; // пересечение
    }
    // Бонус за соседство с существующими буквами (плотность)
    if (r > 0 && grid[r - 1][c] !== null) score += 1;
    if (r < size - 1 && grid[r + 1][c] !== null) score += 1;
    if (c > 0 && grid[r][c - 1] !== null) score += 1;
    if (c < size - 1 && grid[r][c + 1] !== null) score += 1;
  }
  return score;
}

function fits(
  grid: (string | null)[][],
  word: string,
  row: number,
  col: number,
  dir: "across" | "down",
  size: number,
): boolean {
  if (row < 0 || col < 0) return false;
  const endRow = dir === "across" ? row : row + word.length - 1;
  const endCol = dir === "across" ? col + word.length - 1 : col;
  if (endRow >= size || endCol >= size) return false;

  // Cell BEFORE the word must be empty (no adjacent letters in same direction).
  if (dir === "across" && col > 0 && grid[row][col - 1] !== null) return false;
  if (dir === "down" && row > 0 && grid[row - 1][col] !== null) return false;
  // Cell AFTER the word must be empty.
  if (dir === "across" && endCol < size - 1 && grid[row][endCol + 1] !== null) return false;
  if (dir === "down" && endRow < size - 1 && grid[endRow + 1][col] !== null) return false;

  let intersections = 0;
  for (let i = 0; i < word.length; i++) {
    const r = dir === "across" ? row : row + i;
    const c = dir === "across" ? col + i : col;
    const cell = grid[r][c];
    if (cell === null) {
      // Sides must be empty (no parallel adjacency, otherwise letters merge).
      if (dir === "across") {
        if (r > 0 && grid[r - 1][c] !== null) return false;
        if (r < size - 1 && grid[r + 1][c] !== null) return false;
      } else {
        if (c > 0 && grid[r][c - 1] !== null) return false;
        if (c < size - 1 && grid[r][c + 1] !== null) return false;
      }
    } else if (cell === word[i]) {
      intersections++;
    } else {
      return false;
    }
  }
  return intersections >= 1;
}

function trim(grid: (string | null)[][]): {
  trimmed: (string | null)[][];
  dRow: number;
  dCol: number;
} {
  const size = grid.length;
  let minR = size,
    maxR = -1,
    minC = size,
    maxC = -1;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] !== null) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }
  if (maxR < 0) return { trimmed: [], dRow: 0, dCol: 0 };
  const trimmed: (string | null)[][] = [];
  for (let r = minR; r <= maxR; r++) {
    trimmed.push(grid[r].slice(minC, maxC + 1));
  }
  return { trimmed, dRow: minR, dCol: minC };
}
