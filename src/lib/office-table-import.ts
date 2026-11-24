/**
 * Клиент-серверный парсер таблиц из файлов Excel (.xlsx), Word (.docx), CSV и TSV
 * без внешних тяжёлых зависимостей (поверх уже установленного JSZip и нашего XML-парсера).
 *
 * Работает одинаково в браузере и в Node.js (через Uint8Array + TextDecoder).
 */

import JSZip from "jszip";
import { parseXml, parseBodyElements, type XmlNode } from "@/lib/import/xml";
import { parseKtpRows, type ParsedKtpRow } from "@/lib/ktp-import";
import { GOSO_SUBJECT_KZ, resolveRussianSubjectName } from "@/lib/goso/kazakh";

export interface ImportedStudentRow {
  fullName: string;
  className: string;
}

export interface ImportedKtpResult {
  items: ParsedKtpRow[];
  detectedSubject?: string;
  detectedGrade?: number;
}

function localTag(tag: string): string {
  const idx = tag.indexOf(":");
  return idx >= 0 ? tag.slice(idx + 1) : tag;
}

function collectSpreadsheetText(node: XmlNode): string {
  const lt = localTag(node.tag);
  if (lt === "rPh") return ""; // Фонетические подсказки в Excel не входят в видимый текст
  let out = "";
  if (lt === "t") {
    out += node.text ?? "";
  }
  for (const child of node.children) {
    out += collectSpreadsheetText(child);
  }
  return out;
}

function findChildrenByLocalTag(node: XmlNode, target: string): XmlNode[] {
  const found: XmlNode[] = [];
  const walk = (n: XmlNode) => {
    if (localTag(n.tag) === target) {
      found.push(n);
      return;
    }
    for (const c of n.children) walk(c);
  };
  for (const c of node.children) walk(c);
  return found;
}

function excelColIndex(cellRef: string | undefined, fallback: number): number {
  if (!cellRef) return fallback;
  const match = cellRef.match(/^([A-Za-z]+)/);
  if (!match) return fallback;
  const letters = match[1]!.toUpperCase();
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return Math.max(0, col - 1);
}

async function parseXlsxBytes(bytes: Uint8Array): Promise<string[][]> {
  const zip = await JSZip.loadAsync(bytes);

  // 1. Читаем xl/sharedStrings.xml (если есть)
  const sharedStrings: string[] = [];
  const sstFile = zip.file("xl/sharedStrings.xml");
  if (sstFile) {
    const sstXml = await sstFile.async("string");
    const root = parseXml(sstXml);
    if (root) {
      const siNodes = findChildrenByLocalTag(root, "si");
      for (const si of siNodes) {
        sharedStrings.push(collectSpreadsheetText(si));
      }
    }
  }

  // 2. Читаем листы xl/worksheets/sheet*.xml по порядку
  const sheetNames = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const allRows: string[][] = [];
  for (const sheetName of sheetNames) {
    const sheetXml = await zip.file(sheetName)?.async("string");
    if (!sheetXml) continue;
    const root = parseXml(sheetXml);
    if (!root) continue;

    const rowNodes = findChildrenByLocalTag(root, "row");
    for (const rowNode of rowNodes) {
      const cNodes = rowNode.children.filter((c) => localTag(c.tag) === "c");
      if (cNodes.length === 0) continue;
      const rowCells: string[] = [];
      for (const cell of cNodes) {
        const colIdx = excelColIndex(cell.attrs.r, rowCells.length);
        while (rowCells.length <= colIdx) rowCells.push("");
        const cellType = cell.attrs.t ?? "";

        let val = "";
        if (cellType === "inlineStr") {
          const isNode = cell.children.find((ch) => localTag(ch.tag) === "is");
          val = isNode ? collectSpreadsheetText(isNode) : collectSpreadsheetText(cell);
        } else {
          const vNode = cell.children.find((ch) => localTag(ch.tag) === "v");
          const rawV = (vNode?.text ?? "").trim();
          if (cellType === "s") {
            const sstIdx = Number.parseInt(rawV, 10);
            val = Number.isFinite(sstIdx) ? (sharedStrings[sstIdx] ?? "") : "";
          } else if (cellType === "e") {
            val = "";
          } else {
            val = rawV;
          }
        }
        rowCells[colIdx] = val.trim();
      }
      if (rowCells.some((c) => c.length > 0)) {
        allRows.push(rowCells);
      }
    }
  }

  return allRows;
}

async function parseDocxTableBytes(bytes: Uint8Array): Promise<string[][]> {
  const zip = await JSZip.loadAsync(bytes);
  const docXml = await zip.file("word/document.xml")?.async("string");
  if (!docXml) throw new Error("Некорректный .docx: отсутствует word/document.xml");

  const elements = parseBodyElements(docXml);
  const rows: string[][] = [];
  for (const el of elements) {
    if (el.type === "table" && el.rows) {
      for (const r of el.rows) {
        const cleaned = r.map((c) => c.replace(/\s+/g, " ").trim());
        if (cleaned.some((c) => c.length > 0)) rows.push(cleaned);
      }
    } else if (el.type === "paragraph" && el.text?.trim()) {
      rows.push([el.text.trim()]);
    }
  }
  return rows;
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

export function parseCsvOrTsvText(raw: string): string[][] {
  const text = raw.replace(/^\uFEFF/, "");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  // Выбираем разделитель по первым непустым строкам
  const sample = lines.slice(0, 5).join("\n");
  const counts: Array<[string, number]> = [
    ["\t", (sample.match(/\t/g) ?? []).length],
    [";", (sample.match(/;/g) ?? []).length],
    [",", (sample.match(/,/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  const delimiter = counts[0]![1] > 0 ? counts[0]![0] : "\t";

  return lines.map((l) => splitDelimitedLine(l, delimiter));
}

async function toBytes(input: File | Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(await input.arrayBuffer());
}

/**
 * Извлекает строки таблицы из файла `.xlsx`, `.docx`, `.csv`, `.tsv` или `.txt`.
 */
export async function extractRowsFromOfficeFile(
  file: File | Blob | ArrayBuffer | Uint8Array,
  filename: string,
): Promise<string[][]> {
  const lower = filename.toLowerCase().trim();
  const bytes = await toBytes(file);

  if (lower.endsWith(".xlsx")) {
    return parseXlsxBytes(bytes);
  }
  if (lower.endsWith(".docx")) {
    return parseDocxTableBytes(bytes);
  }
  if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt")) {
    const decoded = new TextDecoder("utf-8").decode(bytes);
    return parseCsvOrTsvText(decoded);
  }

  throw new Error("Поддерживаются файлы .xlsx, .docx, .csv и .tsv");
}

const SUBJECT_ENTRIES = Object.entries(GOSO_SUBJECT_KZ).sort(
  (a, b) => Math.max(b[0].length, b[1].length) - Math.max(a[0].length, a[1].length),
);

function detectSubjectAndGradeFromRows(rows: string[][]): {
  subject?: string;
  grade?: number;
} {
  let subject: string | undefined;
  let grade: number | undefined;
  const topText = rows
    .slice(0, 10)
    .map((r) => r.join(" "))
    .join("\n");

  for (const [ru, kz] of SUBJECT_ENTRIES) {
    const lower = topText.toLocaleLowerCase("ru-RU");
    if (
      lower.includes(ru.toLocaleLowerCase("ru-RU")) ||
      lower.includes(kz.toLocaleLowerCase("ru-RU"))
    ) {
      subject = resolveRussianSubjectName(ru) ?? ru;
      break;
    }
  }

  const gradeMatch =
    topText.match(/\b(1[01]|[1-9])\s*(?:[«"']?[А-ЯӘҒҚҢӨҰҮҺІа-яәғқңөұүһіA-Za-z][»"']?\s*)?(?:класс|сынып)/iu) ??
    topText.match(/(?:класс|сынып)\s*[:№-]?\s*(1[01]|[1-9])\b/iu);
  if (gradeMatch) {
    grade = Number(gradeMatch[1]);
  }

  return { subject, grade };
}

const GOSO_CODE_GLOBAL = /\b\d{1,2}\.\d\.\d\.\d{1,2}\b/g;

/**
 * Превращает извлечённые строки Excel/Word/CSV в структуру КТП (разделы, темы, часы, цели ГОСО).
 */
export function parseKtpFromRows(rows: string[][]): ImportedKtpResult {
  const { subject: detectedSubject, grade: detectedGrade } = detectSubjectAndGradeFromRows(rows);

  // Попробуем найти табличную шапку КТП (BilimClass / Kundelik / Приказ №130)
  let headerRowIdx = -1;
  let colSection = -1;
  let colTopic = -1;
  let colObjectives = -1;
  let colHours = -1;

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i]!;
    if (r.length < 2) continue;
    let sIdx = -1;
    let tIdx = -1;
    let oIdx = -1;
    let hIdx = -1;

    r.forEach((cell, idx) => {
      const c = cell.toLocaleLowerCase("ru-RU").replace(/\s+/g, " ").trim();
      if (!c) return;
      if (tIdx < 0 && /(тема\s*урок|темы\s*урок|сабақ\s*тақырыб|тақырыптар|наименование\s*тем)/i.test(c)) {
        tIdx = idx;
      } else if (sIdx < 0 && /(раздел|сквозн|бөлім|ортақ\s*тақырып)/i.test(c)) {
        sIdx = idx;
      } else if (oIdx < 0 && /(цел[ьи]\s*обучен|оқу\s*мақсат)/i.test(c)) {
        oIdx = idx;
      } else if (hIdx < 0 && /(кол-?во\s*час|количество\s*час|часы|час\.|сағат)/i.test(c)) {
        hIdx = idx;
      }
    });

    if (tIdx >= 0 && (oIdx >= 0 || hIdx >= 0 || sIdx >= 0)) {
      headerRowIdx = i;
      colSection = sIdx;
      colTopic = tIdx;
      colObjectives = oIdx;
      colHours = hIdx;
      break;
    }
  }

  if (headerRowIdx >= 0 && colTopic >= 0) {
    const items: ParsedKtpRow[] = [];
    let currentSection = "";

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const r = rows[i]!;
      const nonEmpty = r.filter((c) => c.trim().length > 0);
      if (nonEmpty.length === 0) continue;

      // Строка-разделитель четверти или раздела на всю ширину
      if (nonEmpty.length === 1) {
        const single = nonEmpty[0]!.trim();
        if (/^(раздел|бөлім|\d+\s*(?:четверт|тоқсан)|[IV]+\s*(?:четверт|тоқсан))/iu.test(single)) {
          currentSection = single;
        }
        continue;
      }

      if (colSection >= 0 && r[colSection]?.trim()) {
        const secCandidate = r[colSection]!.trim();
        if (!/^\d+$/.test(secCandidate)) {
          currentSection = secCandidate;
        }
      }

      const rawTopic = (r[colTopic] ?? "").replace(/^\d+[.)]\s*/, "").trim();
      if (!rawTopic) continue;
      // Пропускаем строки «Итого за четверть / Барлығы» (граница слова для кириллицы через Unicode)
      if (/^(итого|всего|барлығы|жиыны)(?![\p{L}\p{N}])/iu.test(rawTopic)) continue;
      // Пропускаем повторную шапку на следующей странице Word
      if (/^(тема\s*урока|сабақ\s*тақырыбы)$/iu.test(rawTopic)) continue;

      let hours = 1;
      if (colHours >= 0 && r[colHours]?.trim()) {
        const parsedH = Number.parseInt(r[colHours]!.trim(), 10);
        if (Number.isFinite(parsedH) && parsedH >= 1 && parsedH <= 20) {
          hours = parsedH;
        }
      }

      let objectives = "";
      if (colObjectives >= 0 && r[colObjectives]?.trim()) {
        objectives = r[colObjectives]!.replace(/\s+/g, " ").trim();
      } else {
        // Ищем коды ГОСО в соседних ячейках, если колонка не подписана стандартно
        const codes = r.join(" ").match(GOSO_CODE_GLOBAL);
        if (codes && codes.length > 0) {
          objectives = Array.from(new Set(codes)).join("; ");
        }
      }

      items.push({
        ...(currentSection ? { section: currentSection.slice(0, 200) } : {}),
        title: rawTopic.slice(0, 280),
        hours,
        objectives: objectives.slice(0, 500),
      });
    }

    if (items.length > 0) {
      return {
        items: items.slice(0, 180),
        detectedSubject,
        detectedGrade,
      };
    }
  }

  // Универсальный фолбэк через строковый парсер КТП
  const tsv = rows
    .map((r) => r.filter((c) => c.trim().length > 0).join("\t"))
    .filter(Boolean)
    .join("\n");

  return {
    items: parseKtpRows(tsv),
    detectedSubject,
    detectedGrade,
  };
}

function normalizeClassBadge(raw: string): string {
  const cleaned = raw
    .replace(/[«»"']/g, "")
    .replace(/(?<![\p{L}\p{N}])(класс|сынып|кл\.?)(?![\p{L}\p{N}])/giu, "")
    .replace(/\s+/g, "")
    .trim();
  return cleaned.slice(0, 16);
}

function looksLikePersonName(text: string): boolean {
  const cleaned = text.replace(/^\d+\s*[.)-]?\s*/, "").trim();
  if (cleaned.length < 3 || cleaned.length > 90) return false;
  if (/\d{4,}/.test(cleaned)) return false; // ИИН / телефон / дата
  if (
    /^(фио|ф\.и\.о|аты-жөні|фамилия|тегі|ученик|оқушы|список|тізім|итого|барлығы|класс|сынып)(?![\p{L}\p{N}])/iu.test(
      cleaned,
    )
  ) {
    return false;
  }
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 5) return false;
  // Должны быть буквы кириллицы или латиницы
  return /[\p{L}]{2,}/u.test(cleaned);
}

/**
 * Извлекает список учеников (ФИО + класс) из таблицы Excel, Word или CSV.
 * Поддерживает как единый столбец «ФИО», так и раздельные столбцы «Фамилия | Имя | Отчество»
 * и опциональный столбец «Класс / Сынып».
 */
export function parseStudentsFromRows(
  rows: string[][],
  fallbackClassName = "7А",
): ImportedStudentRow[] {
  let defaultClass = fallbackClassName.trim() || "7А";

  // Проверим верхние строки на заголовок вида «Список 8 "Б" класса»
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const line = rows[i]!.join(" ");
    const m = line.match(/\b(1[01]|[1-9])\s*[«"']?([А-ЯӘҒҚҢӨҰҮҺІA-Z])[»"']?\s*(?:класс|сынып)?/iu);
    if (m && /(список|тізім|класс|сынып|учащ|оқушы)/iu.test(line)) {
      defaultClass = `${m[1]}${m[2]!.toUpperCase()}`;
      break;
    }
  }

  let headerIdx = -1;
  let colFullName = -1;
  let colLastName = -1;
  let colFirstName = -1;
  let colMiddleName = -1;
  let colClass = -1;

  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const r = rows[i]!;
    let full = -1;
    let last = -1;
    let first = -1;
    let mid = -1;
    let cls = -1;

    r.forEach((cell, idx) => {
      const c = cell.toLocaleLowerCase("ru-RU").replace(/\s+/g, " ").trim();
      if (!c) return;
      if (full < 0 && /(^фио$|^ф\.?\s*и\.?\s*о\.?|фио\s*уч|аты[\s-]*жөні|оқушының\s*аты|ученик|учащийся|full\s*name)/i.test(c)) {
        full = idx;
      } else if (last < 0 && /^(фамилия|тегі|surname|last\s*name)$/i.test(c)) {
        last = idx;
      } else if (first < 0 && /^(имя|аты|есімі|first\s*name)$/i.test(c)) {
        first = idx;
      } else if (mid < 0 && /^(отчество|әкесінің\s*аты|middle\s*name)$/i.test(c)) {
        mid = idx;
      } else if (cls < 0 && /^(класс|сынып|сыныбы|литер|параллель|class)$/i.test(c)) {
        cls = idx;
      }
    });

    if (full >= 0 || (last >= 0 && first >= 0)) {
      headerIdx = i;
      colFullName = full;
      colLastName = last;
      colFirstName = first;
      colMiddleName = mid;
      colClass = cls;
      break;
    }
  }

  const out: ImportedStudentRow[] = [];
  const seen = new Set<string>();

  const pushStudent = (rawName: string, rawClass?: string) => {
    const cleanName = rawName
      .replace(/^\d+\s*[.)-]\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!looksLikePersonName(cleanName)) return;
    // Требуем хотя бы Фамилию + Имя (или имя из >=2 слов, либо явную колонку ФИО)
    const cls = rawClass ? normalizeClassBadge(rawClass) || defaultClass : defaultClass;
    const key = `${cls.toLowerCase()}::${cleanName.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ fullName: cleanName.slice(0, 100), className: cls });
  };

  if (headerIdx >= 0) {
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i]!;
      const rowClass = colClass >= 0 ? r[colClass] : undefined;
      if (colFullName >= 0) {
        const name = r[colFullName] ?? "";
        if (name.trim()) pushStudent(name, rowClass);
      } else if (colLastName >= 0 && colFirstName >= 0) {
        const parts = [
          r[colLastName]?.trim() ?? "",
          r[colFirstName]?.trim() ?? "",
          colMiddleName >= 0 ? (r[colMiddleName]?.trim() ?? "") : "",
        ].filter(Boolean);
        if (parts.length >= 2) pushStudent(parts.join(" "), rowClass);
      }
    }
    return out.slice(0, 400);
  }

  // Без явной шапки: ищем ФИО в каждой строке (пропуская номер по порядку в 1-м столбце)
  for (const r of rows) {
    const cells = r.map((c) => c.trim()).filter(Boolean);
    if (cells.length === 0) continue;

    // Убираем ведущий номер («1», «2.»)
    const work = [...cells];
    if (/^\d+[.)]?$/.test(work[0]!) && work.length > 1) {
      work.shift();
    }

    // Проверим, нет ли отдельного короткого кода класса («7А», «10Б»)
    let rowCls: string | undefined;
    const clsIdx = work.findIndex((c) => /^(1[01]|[1-9])\s*[«"']?[А-ЯӘҒҚҢӨҰҮҺІA-Z][»"']?$/iu.test(c));
    if (clsIdx > 0) {
      rowCls = work[clsIdx];
      work.splice(clsIdx, 1);
    }

    const candidate = work[0] ?? "";
    if (candidate.split(/\s+/).length >= 2 && looksLikePersonName(candidate)) {
      pushStudent(candidate, rowCls);
    } else if (
      work.length >= 2 &&
      /^[\p{L}-]{2,}$/u.test(work[0]!) &&
      /^[\p{L}-]{2,}$/u.test(work[1]!)
    ) {
      const joined = [work[0], work[1], work[2]]
        .filter((part): part is string => Boolean(part && /^[\p{L}-]{2,}$/u.test(part)))
        .join(" ");
      if (joined.split(/\s+/).length >= 2) {
        pushStudent(joined, rowCls);
      }
    }
  }

  return out.slice(0, 400);
}
