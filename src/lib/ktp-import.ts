/**
 * Разбор строк КТП / ДСП / ССП, скопированных учителем из Excel, Word или CSV-файла.
 * Поддерживает:
 *  - TSV (копирование столбцов из Excel / Word таблицы: "№ \t Тема урока \t Часы \t Цели ГОСО")
 *  - CSV с точкой с запятой (;)
 *  - обычный нумерованный список тем построчно ("1. Квадратные корни")
 */

export interface ParsedKtpRow {
  section?: string;
  title: string;
  hours: number;
  objectives: string;
}

const HEADER_WORDS = /^(№|#|номер|тема\s*урока|тақырып|раздел|бөлім|сағат|часы|кол-во\s*часов)$/i;
const GOSO_CODE_RE = /\b\d{1,2}\.\d\.\d\.\d{1,2}\b/;

export function parseKtpRows(raw: string): ParsedKtpRow[] {
  const out: ParsedKtpRow[] = [];
  let currentSection = "";

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    // Раздел отдельной строкой, например "Раздел 1. Информация и её обработка"
    if (/^(раздел|бөлім)\s*\d*/iu.test(line) && !line.includes("\t") && !line.includes(";")) {
      currentSection = line;
      continue;
    }

    const delimiter = line.includes("\t") ? "\t" : line.includes(";") ? ";" : null;
    if (delimiter) {
      const cols = line
        .split(delimiter)
        .map((c) => c.trim().replace(/^"|"$/g, ""))
        .filter((c) => c.length > 0);

      if (cols.length === 0) continue;
      // Пропускаем строку шапки таблицы
      if (cols.some((c) => HEADER_WORDS.test(c)) && cols.every((c) => !GOSO_CODE_RE.test(c))) {
        continue;
      }

      // Убираем ведущий порядковый номер столбца ("1", "2.", "Урок 3")
      const workCols = [...cols];
      if (/^(\d+[.)]?|урок\s*\d+|сабақ\s*\d+)$/iu.test(workCols[0] ?? "") && workCols.length > 1) {
        workCols.shift();
      }

      let hours = 1;
      let objectives = "";
      const textParts: string[] = [];

      for (const col of workCols) {
        if (/^\d{1,2}(\s*(ч|сағ)\.?)?$/iu.test(col)) {
          const parsed = parseInt(col, 10);
          if (parsed >= 1 && parsed <= 20) {
            hours = parsed;
            continue;
          }
        }
        if (GOSO_CODE_RE.test(col)) {
          objectives = objectives ? `${objectives}; ${col}` : col;
          continue;
        }
        textParts.push(col);
      }

      const title = (textParts[0] ?? "").replace(/^\d+[.)]\s*/, "").trim();
      if (!title || HEADER_WORDS.test(title)) continue;
      if (textParts.length > 1 && !objectives) {
        objectives = textParts.slice(1).join("; ");
      }

      out.push({
        ...(currentSection ? { section: currentSection } : {}),
        title: title.slice(0, 280),
        hours,
        objectives: objectives.slice(0, 500),
      });
      continue;
    }

    // Обычная строка списка
    const cleaned = line.replace(/^(\d+[.)]|[-•*])\s*/, "").trim();
    if (!cleaned || HEADER_WORDS.test(cleaned)) continue;
    const hoursMatch = cleaned.match(/[—\-–(|]\s*(\d{1,2})\s*(?:ч|час|сағ)\.?\)?$/iu);
    const hours = hoursMatch ? Math.max(1, parseInt(hoursMatch[1]!, 10)) : 1;
    const title = hoursMatch ? cleaned.slice(0, hoursMatch.index).trim() : cleaned;
    if (title.length >= 2) {
      out.push({
        ...(currentSection ? { section: currentSection } : {}),
        title: title.slice(0, 280),
        hours,
        objectives: "",
      });
    }
  }

  return out.slice(0, 120);
}
