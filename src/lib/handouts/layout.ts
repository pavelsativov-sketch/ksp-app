/**
 * Единая нормализация размеров элементов рабочего листа.
 *
 * Раньде docx и предпросмотр держали свои значения по умолчанию
 * (4 строки в Word против 3 в превью, 3 ошибок против 2) — учитель видел на
 * экране не то, что получал на печати. Теперь оба рендерера зовут эти функции.
 */

/** Строки таблицы «Что сделано неправильно / Как исправить». */
export const DEFAULT_TABLE_ROWS = 4;
export const MIN_TABLE_ROWS = 2;
export const MAX_TABLE_ROWS = 8;

/** Число ошибок в сценарии (scenario_fix). */
export const DEFAULT_ERRORS_COUNT = 3;
export const MIN_ERRORS_COUNT = 1;
export const MAX_ERRORS_COUNT = 6;

/** Размер сетки для поиска слов. */
export const DEFAULT_WORD_SEARCH_SIZE = 10;
export const MIN_WORD_SEARCH_SIZE = 6;
export const MAX_WORD_SEARCH_SIZE = 15;

/** Количество элементов для упорядочивания. */
export const DEFAULT_ORDERING_COUNT = 5;
export const MIN_ORDERING_COUNT = 3;
export const MAX_ORDERING_COUNT = 8;

/** Количество элементов для задания «Найди лишнее». */
export const DEFAULT_ODD_COUNT = 5;
export const MIN_ODD_COUNT = 3;
export const MAX_ODD_COUNT = 8;

/** Количество категорий для классификации. */
export const DEFAULT_CATEGORY_COUNT = 3;
export const MIN_CATEGORY_COUNT = 2;
export const MAX_CATEGORY_COUNT = 5;

/** Количество элементов для классификации. */
export const DEFAULT_CATEGORY_ITEMS_COUNT = 8;
export const MIN_CATEGORY_ITEMS_COUNT = 4;
export const MAX_CATEGORY_ITEMS_COUNT = 12;

function clamp(value: number, min: number, max: number, fallback: number): number {
  // Number.isFinite важен: без него clamp(NaN) возвращает NaN, и количество
  // строк в документе становилось «NaN».
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

/** Число строк таблицы с корректными границами. */
export function resolveTableRows(value: number | undefined): number {
  return clamp(value ?? DEFAULT_TABLE_ROWS, MIN_TABLE_ROWS, MAX_TABLE_ROWS, DEFAULT_TABLE_ROWS);
}

/** Число ошибок сценария с корректными границами. */
export function resolveErrorsCount(value: number | undefined): number {
  return clamp(value ?? DEFAULT_ERRORS_COUNT, MIN_ERRORS_COUNT, MAX_ERRORS_COUNT, DEFAULT_ERRORS_COUNT);
}

/** Размер сетки для поиска слов. */
export function resolveWordSearchSize(value: number | undefined): number {
  return clamp(value ?? DEFAULT_WORD_SEARCH_SIZE, MIN_WORD_SEARCH_SIZE, MAX_WORD_SEARCH_SIZE, DEFAULT_WORD_SEARCH_SIZE);
}

/** Количество элементов для упорядочивания. */
export function resolveOrderingCount(value: number | undefined): number {
  return clamp(value ?? DEFAULT_ORDERING_COUNT, MIN_ORDERING_COUNT, MAX_ORDERING_COUNT, DEFAULT_ORDERING_COUNT);
}

/** Количество элементов для задания «Найди лишнее». */
export function resolveOddCount(value: number | undefined): number {
  return clamp(value ?? DEFAULT_ODD_COUNT, MIN_ODD_COUNT, MAX_ODD_COUNT, DEFAULT_ODD_COUNT);
}

/** Количество категорий для классификации. */
export function resolveCategoryCount(value: number | undefined): number {
  return clamp(value ?? DEFAULT_CATEGORY_COUNT, MIN_CATEGORY_COUNT, MAX_CATEGORY_COUNT, DEFAULT_CATEGORY_COUNT);
}

/** Количество элементов для классификации. */
export function resolveCategoryItemsCount(value: number | undefined): number {
  return clamp(value ?? DEFAULT_CATEGORY_ITEMS_COUNT, MIN_CATEGORY_ITEMS_COUNT, MAX_CATEGORY_ITEMS_COUNT, DEFAULT_CATEGORY_ITEMS_COUNT);
}

/**
 * Перенос текста для отображения в колонках.
 * Разбивает текст на строки с учётом максимальной ширины.
 */
export function wrapText(text: string, maxCharsPerLine: number = 60): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxCharsPerLine && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine ? `${currentLine} ${word}` : word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines.length > 0 ? lines : [text];
}

/**
 * Разбивает массив на колонки для отображения.
 */
export function splitIntoColumns<T>(items: T[], columnCount: number): T[][] {
  const columns: T[][] = Array.from({ length: columnCount }, () => []);
  items.forEach((item, i) => {
    columns[i % columnCount].push(item);
  });
  return columns;
}
