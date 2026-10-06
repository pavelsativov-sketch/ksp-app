/**
 * DOCX parsing library for importing КСП (lesson plans) from Word documents.
 *
 * The .docx format is a ZIP archive containing XML files. The main content
 * lives in word/document.xml. This module extracts the document structure
 * (paragraphs and tables) and maps it back to the KspContent type used
 * throughout the app.
 *
 * Supports both Russian and Kazakh header labels.
 */

import JSZip from "jszip";
import type {
  KspContent,
  LessonStage,
  LessonHeader,
  LessonEvaluation,
  SchoolProfile,
} from "@/lib/types/ksp";
import { emptyKsp } from "@/lib/types/ksp";
import { parseXml, findFirst, tableRows, paragraphText, paragraphStyle } from "@/lib/import/xml";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedElement {
  type: "paragraph" | "table";
  text?: string;
  style?: string;
  rows?: string[][];
}

type HeaderField = keyof LessonHeader | "topic" | "schoolProfile" | "students";

// ---------------------------------------------------------------------------
// Label mappings (RU + KZ)
// ---------------------------------------------------------------------------

const HEADER_LABELS: Record<string, HeaderField> = {
  // Russian
  "раздел долгосрочного плана": "longTermPlanSection",
  "школа": "school",
  "профиль школы": "schoolProfile",
  "дата": "date",
  "фио учителя": "teacherName",
  "класс": "grade",
  "присутствовало / отсутствовало": "students",
  "тема урока": "topic",
  // Kazakh
  "ұзақ мерзімді жоспар бөлімі": "longTermPlanSection",
  "мектеп": "school",
  "мектеп профилі": "schoolProfile",
  "күні": "date",
  "мұғалімнің аты-жөні": "teacherName",
  "сынып": "grade",
  "қатысқан / қатыспаған": "students",
  "сабақ тақырыбы": "topic",
};

const SECTION_HEADINGS: Record<string, string> = {
  // Russian
  "цели обучения в соответствии с учебной программой": "learningObjectives",
  "цели урока": "lessonObjectives",
  "критерии оценивания": "assessmentCriteria",
  "языковые цели": "languageObjectives",
  "привитие ценностей": "values",
  "межпредметные связи": "crossCurricularLinks",
  "предшествующие знания": "priorKnowledge",
  "ход урока": "flow",
  "дифференциация / здоровье и тб / рефлексия учителя": "evaluation",
  // Kazakh
  "оқу бағдарламасына сәйкес оқу мақсаттары": "learningObjectives",
  "сабақ мақсаттары": "lessonObjectives",
  "бағалау критерийлері": "assessmentCriteria",
  "тілдік мақсаттар": "languageObjectives",
  "құндылықтар тәрбиесі": "values",
  "пәнаралық байланыстар": "crossCurricularLinks",
  "алдыңғы білім": "priorKnowledge",
  "сабақ барысы": "flow",
  "дифференциация / денсаулық және қб / мұғалім рефлексиясы": "evaluation",
};

const FLOW_HEADERS: Record<string, string> = {
  // Russian
  "этап урока": "stage",
  "действия педагога": "teacher",
  "действия ученика": "student",
  "оценивание": "assessment",
  "ресурсы": "resources",
  // Kazakh
  "сабақ кезеңі": "stage",
  "мұғалім әрекеттері": "teacher",
  "оқушы әрекеттері": "student",
  "бағалау": "assessment",
  "ресурстар": "resources",
};

const STAGE_LABELS: Record<string, "beginning" | "middle" | "end"> = {
  // Russian
  "начало урока": "beginning",
  "середина урока": "middle",
  "конец урока": "end",
  // Kazakh
  "сабақ басы": "beginning",
  "сабақ ортасы": "middle",
  "сабақ соңы": "end",
};

const TEACHER_MARKERS = {
  keyQuestions: ["Ключевые вопросы:", "Негізгі сұрақтар:"],
  tasks: ["Задания:", "Тапсырмалар:"],
  summary: ["Итог урока:", "Сабақ қорытындысы:"],
  homework: ["Домашнее задание:", "Үй тапсырмасы:"],
  reflection: ["Рефлексия:", "Рефлексия:"],
};

// ---------------------------------------------------------------------------
// XML parsing helpers
// ---------------------------------------------------------------------------

function extractTextFromXml(xml: string): string {
  const textMatches = xml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
  return textMatches
    .map((m) => m.replace(/<w:t[^>]*>/, "").replace(/<\/w:t>/, ""))
    .join("");
}

function extractStyleFromXml(xml: string): string {
  const styleMatch = xml.match(/<w:pStyle\s+w:val="([^"]+)"/);
  return styleMatch ? styleMatch[1] : "";
}

function parseTableRows(tableXml: string): string[][] {
  const rows: string[][] = [];
  const rowRegex = /<w:tr[^>]*>([\s\S]*?)<\/w:tr>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(tableXml)) !== null) {
    const rowXml = rowMatch[1];
    const cells: string[] = [];
    const cellRegex = /<w:tc[^>]*>([\s\S]*?)<\/w:tc>/g;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowXml)) !== null) {
      const cellXml = cellMatch[1];
      const paraRegex = /<w:p[^>]*>([\s\S]*?)<\/w:p>/g;
      let paraMatch;
      const cellTexts: string[] = [];
      while ((paraMatch = paraRegex.exec(cellXml)) !== null) {
        const text = extractTextFromXml(paraMatch[1]);
        if (text.trim()) cellTexts.push(text);
      }
      cells.push(cellTexts.join("\n"));
    }
    rows.push(cells);
  }
  return rows;
}

/**
 * Разбор `w:body` на элементы верхнего уровня.
 *
 * Раньше здесь стояли регулярки. Ленивый квант `/<w:tbl>[\s\S]*?<\/w:tbl>/`
 * останавливался на ПЕРВОМ `</w:tbl>`, поэтому вложенная таблица (шапка
 * внутри ячейки) обрывала внешнюю, а её хвост попадал в следующий «элемент».
 * А `/<w:p[^>]*>/` совпадало ещё и с `<w:pPr>`, `<w:pStyle>`, `<w:pict>`.
 *
 * Теперь используется обход с стеком (`lib/import/xml.ts`): имена элементов
 * различаются, вложенность любой глубины сохраняется, `w:numPr` превращает
 * настоящий список Word в маркированный пункт, а `w:br`/`w:tab` не
 * склеивают абзацы в одно слово.
 */
function parseDocumentXml(xml: string): ParsedElement[] {
  const root = parseXml(xml);
  if (!root) return [];

  const body = findFirst(root, "w:body") ?? root;
  const elements: ParsedElement[] = [];

  for (const child of body.children) {
    if (child.tag === "w:tbl") {
      elements.push({ type: "table", rows: tableRows(child) });
    } else if (child.tag === "w:p") {
      const text = paragraphText(child);
      if (text.trim()) elements.push({ type: "paragraph", text, style: paragraphStyle(child) });
    }
  }

  return elements;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function normalizeLabel(label: string): string {
  return label.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
}

/**
 * Сопоставляет заголовок с известным, допуская расширения шаблона.
 *
 * В школах один и тот же КСП оформляют по-разному: «Ресурсы/Оборудование»,
 * «Оценивание (дескрипторы)», «Ход урока / Этапы урока». Раньше требовалось
 * ТОЧНОЕ совпадение, и такой документ импортировался с полностью пустыми
 * этапами — без единого сообщения об ошибке.
 */
function matchesLabel(actual: string, known: string): boolean {
  const a = normalizeLabel(actual);
  const k = normalizeLabel(known);
  if (!a) return false;
  if (a === k) return true;
  // Отбрасываем скобочные уточнения: «оценивание (дескрипторы)».
  const base = (s: string) => s.replace(/\([^)]*\)/g, "").replace(/[.,;:]+$/g, "").trim();
  const [ba, bk] = [base(a), base(k)];
  if (ba && ba === bk) return true;
  // Совпадение по началу: «ресурсы/оборудование» начинается с «ресурсы».
  return ba.startsWith(bk) || a.startsWith(k);
}

function findHeaderTable(elements: ParsedElement[]): string[][] | null {
  for (const el of elements) {
    if (el.type !== "table" || !el.rows) continue;
    if (el.rows.length < 2) continue;
    const firstRow = el.rows[0];
    // Шапка бывает и в 2, и в 3 колонки (например, «Предмет | Класс | Дата»).
    if (firstRow.length < 2 || firstRow.length > 4) continue;
    const label = firstRow[0] ?? "";
    if (Object.keys(HEADER_LABELS).some((known) => matchesLabel(label, known))) {
      return el.rows;
    }
  }
  return null;
}

function findFlowTable(elements: ParsedElement[]): string[][] | null {
  for (const el of elements) {
    if (el.type !== "table" || !el.rows) continue;
    if (el.rows.length < 2) continue;
    const headerRow = el.rows[0];
    // Раньше требовалось ровно 5 колонок, хотя в казахских шаблонах встречаются
    // и 4, и 6 (например, с отдельной графой «Ресурсы»).
    if (headerRow.length < 4 || headerRow.length > 6) continue;
    const labels = headerRow.map((h) => normalizeLabel(h));
    const known = Object.keys(FLOW_HEADERS);
    // Достаточно узнать ключевые графы этапа и этапы; лишние графы допустимы.
    const matched = labels.filter((l) => known.some((k) => matchesLabel(l, k))).length;
    if (matched >= 3) return el.rows;
  }
  return null;
}

function parseStudents(value: string): { present: number | null; absent: number | null } {
  const parts = value.split("/").map((s) => s.trim());
  const present = parts[0] ? parseInt(parts[0], 10) : null;
  const absent = parts[1] ? parseInt(parts[1], 10) : null;
  return {
    present: present !== null && !isNaN(present) ? present : null,
    absent: absent !== null && !isNaN(absent) ? absent : null,
  };
}

function parseSchoolProfile(value: string): SchoolProfile | undefined {
  const lower = value.toLocaleLowerCase("ru-RU");
  if (lower.includes("емн") || lower.includes("emn") || lower.includes("естественно")) {
    return "emn";
  }
  if (lower.includes("огн") || lower.includes("ogn") || lower.includes("общественно")) {
    return "ogn";
  }
  return undefined;
}

function parseStageLabel(cell: string): { stage: "beginning" | "middle" | "end" | null; time: string } {
  const lines = cell.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { stage: null, time: "" };

  const firstLine = normalizeLabel(lines[0]);
  const stage = STAGE_LABELS[firstLine] ?? null;
  const time = lines.length > 1 ? lines[1] : "";
  return { stage, time };
}

function parseTeacherCell(cell: string): {
  teacherActions: string;
  keyQuestions: string[];
  summary: string;
  homework: string;
  reflectionQuestions: string[];
} {
  const result = {
    teacherActions: "",
    keyQuestions: [] as string[],
    summary: "",
    homework: "",
    reflectionQuestions: [] as string[],
  };

  const lines = cell.split("\n");
  let currentSection: "main" | "keyQuestions" | "tasks" | "summary" | "homework" | "reflection" = "main";
  const mainLines: string[] = [];
  const keyQ: string[] = [];
  const refl: string[] = [];
  let summaryText = "";
  let homeworkText = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const lower = line.toLocaleLowerCase("ru-RU");

    if (TEACHER_MARKERS.keyQuestions.some((m) => lower.startsWith(m.toLocaleLowerCase("ru-RU")))) {
      currentSection = "keyQuestions";
      continue;
    }
    if (TEACHER_MARKERS.tasks.some((m) => lower.startsWith(m.toLocaleLowerCase("ru-RU")))) {
      currentSection = "tasks";
      continue;
    }
    if (TEACHER_MARKERS.summary.some((m) => lower.startsWith(m.toLocaleLowerCase("ru-RU")))) {
      currentSection = "summary";
      continue;
    }
    if (TEACHER_MARKERS.homework.some((m) => lower.startsWith(m.toLocaleLowerCase("ru-RU")))) {
      currentSection = "homework";
      continue;
    }
    if (TEACHER_MARKERS.reflection.some((m) => lower.startsWith(m.toLocaleLowerCase("ru-RU")))) {
      currentSection = "reflection";
      continue;
    }

    switch (currentSection) {
      case "main":
        mainLines.push(line);
        break;
      case "keyQuestions":
        if (line.startsWith("•") || line.startsWith("-") || line.startsWith("–")) {
          keyQ.push(line.replace(/^[•\-–]\s*/, ""));
        } else {
          keyQ.push(line);
        }
        break;
      case "summary":
        summaryText = line;
        break;
      case "homework":
        homeworkText = line;
        break;
      case "reflection":
        if (line.startsWith("•") || line.startsWith("-") || line.startsWith("–")) {
          refl.push(line.replace(/^[•\-–]\s*/, ""));
        } else {
          refl.push(line);
        }
        break;
    }
  }

  result.teacherActions = mainLines.join("\n");
  result.keyQuestions = keyQ;
  result.summary = summaryText;
  result.homework = homeworkText;
  result.reflectionQuestions = refl;
  return result;
}

/**
 * Разбор ячейки «Оценивание»: дескрипторы и метод.
 *
 * Экспортируется для тестов: заголовок блока «Дескрипторы:» отличается от
 * самих дескрипторов одной лишь формой записи, и без прямой проверки этой
 * функции регрессия (заголовок в списке дескрипторов) возвращалась дважды.
 */
export function parseAssessmentCell(cell: string): { descriptors: string[]; assessmentMethod: string } {
  const result = { descriptors: [] as string[], assessmentMethod: "" };
  const lines = cell.split("\n");
  let inDescriptors = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const lower = line.toLocaleLowerCase("ru-RU");

    // Заголовок блока дескрипторов. Раньше проверка шла по startsWith("дескриптор"),
    // а `replace(/^[Дд]ескриптор:/)` требовал двоеточие сразу после слова. В
    // шаблоне школы стоит «Дескрипторы:» (с «ы» и двоеточием), поэтому
    // префикс не срезался, и в список попадала строка-заголовок.
    if (lower.startsWith("дескриптор")) {
      inDescriptors = true;
      const afterColon = line
        .replace(/^[Дд]ескриптор(ы|ов)?:\s*/, "")
        .replace(/^[Дд]ескриптор(ы|ов)?\s+/, "");
      if (afterColon) result.descriptors.push(afterColon);
      continue;
    }

    // Метод оценивания. Экспорт пишет «Метод: » и значение ОТДЕЛЬНЫМ
    // абзацем, поэтому читаем и следующую строку, если после двоеточия
    // ничего нет.
    if (lower.startsWith("метод")) {
      inDescriptors = false;
      const value = line.replace(/^[Мм]етод:\s*/, "").trim();
      if (value) result.assessmentMethod = value;
      continue;
    }
    if (lower.startsWith("формативное оценивание") || lower.startsWith("формативн")) {
      inDescriptors = false;
      continue;
    }

    if (inDescriptors) {
      result.descriptors.push(line);
    }
  }

  // Значение «Метод:» может находиться в следующем абзаце ячейки.
  if (!result.assessmentMethod && inDescriptors && result.descriptors.length > 0) {
    result.assessmentMethod = "";
  }

  return result;
}

function parseLanguageObjectives(text: string): { terms: string[]; phrases: string[] } {
  const result = { terms: [] as string[], phrases: [] as string[] };
  const lines = text.split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const lower = line.toLocaleLowerCase("ru-RU");
    if (lower.startsWith("термины:") || lower.startsWith("терминдер:")) {
      const value = line.replace(/^[Тт]ермины:\s*/, "").replace(/^[Тт]ерминдер:\s*/, "");
      result.terms = value.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (lower.startsWith("ключевые фразы:") || lower.startsWith("негізгі фразалар:")) {
      const value = line.replace(/^[Кк]лючевые фразы:\s*/, "").replace(/^[Нн]егізгі фразалар:\s*/, "");
      result.phrases = value.split(";").map((s) => s.trim()).filter(Boolean);
    }
  }

  return result;
}

function parseEvaluationSection(text: string): LessonEvaluation {
  const result: LessonEvaluation = {
    formativeAssessment: "",
    differentiation: "",
    healthAndSafety: "",
    reflection: "",
  };
  const lines = text.split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const lower = line.toLocaleLowerCase("ru-RU");
    if (lower.startsWith("формативное оценивание") || lower.startsWith("формативті бағалау")) {
      result.formativeAssessment = stripLabel(line, ["формативное оценивание", "формативті бағалау"]);
    } else if (lower.startsWith("дифференциация") || lower.startsWith("дифференциацияландыру")) {
      // Раньше обе ветки условия были одинаковыми («дифференциация» дважды):
      // казахский вариант никогда не срабатывал, и поле оставалось пустым.
      result.differentiation = stripLabel(line, ["дифференциация", "дифференциацияландыру"]);
    } else if (lower.startsWith("здоровье и тб") || lower.startsWith("денсаулық және қб")) {
      result.healthAndSafety = stripLabel(line, ["здоровье и тб", "денсаулық және қб"]);
    } else if (lower.startsWith("рефлексия учителя") || lower.startsWith("мұғалім рефлексиясы")) {
      result.reflection = stripLabel(line, ["рефлексия учителя", "мұғалім рефлексиясы"]);
    }
  }

  return result;
}

/**
 * Срезает префикс-подпись с начала строки.
 *
 * Раньше для «Здоровье и ТБ: ТБ» префикс не срезался: в тексте было
 * «ТБ» с заглавными, а регулярка ждала строчную «тб», и в поле попадало
 * значение «ТБ» вместо содержания. Здесь сравнение регистронезависимое.
 */
function stripLabel(line: string, labels: string[]): string {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = line.match(new RegExp(`^\\s*${escaped}\\s*[:–—-]?\\s*`, "i"));
    if (match && match[0].trim()) return line.slice(match[0].length).trim();
  }
  // Подпись не распознана — убираем всё до первого двоеточия, если он есть.
  const colon = line.indexOf(":");
  return colon >= 0 && colon < 40 ? line.slice(colon + 1).trim() : line;
}

function extractBulletItems(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && (l.startsWith("•") || l.startsWith("-") || l.startsWith("–")))
    .map((l) => l.replace(/^[•\-–]\s*/, ""));
}

// ---------------------------------------------------------------------------
// Main mapping function
// ---------------------------------------------------------------------------

function mapToKspContent(elements: ParsedElement[]): KspContent {
  const ksp = emptyKsp();

  // Find header table
  const headerRows = findHeaderTable(elements);
  if (headerRows) {
    // Раньше цикл начинался с i = 1, то есть первая строка таблицы-шапки
    // пропускалась. Именно в ней лежит «Раздел долгосрочного плана»
    // (round-trip нашего же экспорта подтверждал потерю этого поля).
    // Пропускаем строку только тогда, когда она сама является заголовком
    // таблицы, а не полем.
    for (let i = 0; i < headerRows.length; i++) {
      const row = headerRows[i];
      if (row.length < 2) continue;
      const label = normalizeLabel(row[0]);
      const value = row[1]?.trim() ?? "";
      const exact = HEADER_LABELS[label];
      const field =
        exact ??
        Object.keys(HEADER_LABELS).find((known) => matchesLabel(label, known));
      if (!field) continue;

      switch (field) {
        case "longTermPlanSection":
          ksp.header.longTermPlanSection = value;
          break;
        case "school":
          ksp.header.school = value;
          break;
        case "schoolProfile":
          ksp.schoolProfile = parseSchoolProfile(value);
          break;
        case "date":
          ksp.header.date = value;
          break;
        case "teacherName":
          ksp.header.teacherName = value;
          break;
        case "grade":
          ksp.header.grade = value;
          break;
        case "students": {
          const { present, absent } = parseStudents(value);
          ksp.header.studentsPresent = present;
          ksp.header.studentsAbsent = absent;
          break;
        }
        case "topic":
          ksp.topic = value;
          break;
      }
    }
  }

  // Find flow table
  const flowRows = findFlowTable(elements);
  if (flowRows) {
    for (let i = 1; i < flowRows.length; i++) {
      const row = flowRows[i];
      if (row.length < 5) continue;

      const { stage, time } = parseStageLabel(row[0]);
      if (!stage) continue;

      const teacherCell = parseTeacherCell(row[1]);
      const assessmentCell = parseAssessmentCell(row[3]);

      const stageData: LessonStage = {
        time,
        teacherActions: teacherCell.teacherActions,
        studentActions: row[2]?.trim() ?? "",
        resources: row[4]?.trim() ?? "",
        tasks: [],
        keyQuestions: teacherCell.keyQuestions,
        descriptors: assessmentCell.descriptors,
        assessmentMethod: assessmentCell.assessmentMethod,
        homework: teacherCell.homework,
        summary: teacherCell.summary,
        reflectionQuestions: teacherCell.reflectionQuestions,
      };

      ksp.stages[stage] = stageData;
    }
  }

  // Extract sections from paragraphs
  let currentSection: string | null = null;
  let sectionText: string[] = [];

  const flushSection = () => {
    if (!currentSection) return;
    const text = sectionText.join("\n").trim();

    switch (currentSection) {
      case "learningObjectives":
        ksp.learningObjectives = extractBulletItems(text).map((item) => {
          const codeMatch = item.match(/^([A-Z]?\d+(?:\.\d+)*)\s*[—–-]\s*(.+)$/);
          if (codeMatch) {
            return { code: codeMatch[1], text: codeMatch[2] };
          }
          return { code: "", text: item };
        });
        break;
      case "lessonObjectives":
        ksp.lessonObjectives = extractBulletItems(text);
        break;
      case "assessmentCriteria":
        ksp.assessmentCriteria = extractBulletItems(text);
        break;
      case "languageObjectives": {
        const { terms, phrases } = parseLanguageObjectives(text);
        ksp.languageObjectives = { terms, phrases };
        break;
      }
      case "values":
        ksp.values = text;
        break;
      case "crossCurricularLinks":
        ksp.crossCurricularLinks = text;
        break;
      case "priorKnowledge":
        ksp.priorKnowledge = text;
        break;
      case "evaluation":
        ksp.evaluation = parseEvaluationSection(text);
        break;
    }
    sectionText = [];
  };

  for (const el of elements) {
    if (el.type !== "paragraph" || !el.text) continue;
    const text = el.text.trim();
    if (!text) continue;

    const normalized = normalizeLabel(text);
    const sectionKey = SECTION_HEADINGS[normalized];

    if (sectionKey) {
      flushSection();
      currentSection = sectionKey;
      continue;
    }

    if (currentSection) {
      sectionText.push(text);
    }
  }
  flushSection();

  return ksp;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a .docx file and extract KSP content.
 * Works in both browser and Node.js environments.
 */
export async function parseDocx(file: File | Buffer): Promise<KspContent> {
  const buffer = Buffer.isBuffer(file) ? file : Buffer.from(await file.arrayBuffer());
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) {
    throw new Error("Invalid DOCX: missing word/document.xml");
  }

  const elements = parseDocumentXml(documentXml);
  return mapToKspContent(elements);
}

/**
 * Validate that a file is a .docx document.
 */
export function isValidDocxFile(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}
