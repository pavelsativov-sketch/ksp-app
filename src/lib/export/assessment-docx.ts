/**
 * Build a `.docx` for an assessment paper (СОР / СОЧ).
 *
 * Layout (one document):
 *   1. Title + kind + class.
 *   2. Header table (school / teacher / date / sections / duration / max points).
 *   3. Instructions (если есть).
 *   4. Цели обучения.
 *   5. Задания: пронумерованный список с типом, кодом ЦО, баллами, текстом.
 *      Дескрипторы — мелким шрифтом под формулировкой.
 *   6. Критерии оценивания (таблица: код / описание / задания).
 *   7. Шкала перевода (таблица: оценка / баллы).
 *   8. Ключи (для учителя) — на новой странице.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type {
  AssessmentContent,
  AssessmentPaperRow,
} from "@/lib/types/assessment";

const BORDER = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: "000000",
};
const BORDERS = {
  top: BORDER,
  bottom: BORDER,
  left: BORDER,
  right: BORDER,
};

const TASK_TYPE_LABEL_RU: Record<string, string> = {
  open: "Развёрнутый ответ",
  test: "Тест",
  match: "Соответствие",
  fill: "Пропуски",
  essay: "Эссе",
};

function p(
  text: string,
  opts?: { bold?: boolean; italics?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType] },
): Paragraph {
  return new Paragraph({
    alignment: opts?.align,
    children: [
      new TextRun({ text, bold: opts?.bold, italics: opts?.italics }),
    ],
  });
}

function headerCell(text: string): TableCell {
  return new TableCell({
    borders: BORDERS,
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true })],
      }),
    ],
  });
}

function bodyCell(text: string): TableCell {
  return new TableCell({
    borders: BORDERS,
    children: [new Paragraph({ children: [new TextRun({ text })] })],
  });
}

function metaTable(
  paper: AssessmentPaperRow,
  totalPoints: number,
): Table {
  const c = paper.content;
  const rows: [string, string][] = [
    ["Школа", c.header.school || "—"],
    ["ФИО учителя", c.header.teacherName || "—"],
    ["Класс", c.header.grade || String(paper.grade)],
    ["Дата", c.header.date || "—"],
    [
      paper.kind === "sor" ? "Раздел" : "Разделы",
      c.sections.join("; ") || paper.section || "—",
    ],
    ["Длительность", `${c.durationMinutes ?? paper.duration_minutes ?? 40} минут`],
    ["Максимальный балл", String(totalPoints)],
  ];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      ([label, value]) =>
        new TableRow({
          children: [headerCell(label), bodyCell(value)],
        }),
    ),
  });
}

function criteriaTable(content: AssessmentContent): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          headerCell("Код"),
          headerCell("Критерий"),
          headerCell("Задания"),
        ],
        tableHeader: true,
      }),
      ...content.criteria.map(
        (c) =>
          new TableRow({
            children: [
              bodyCell(c.code),
              bodyCell(c.descriptor),
              bodyCell(c.taskNumbers.join(", ")),
            ],
          }),
      ),
    ],
  });
}

function gradeBoundariesTable(content: AssessmentContent): Table {
  const sorted = [...content.gradeBoundaries].sort((a, b) => b.grade - a.grade);
  return new Table({
    width: { size: 60, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [headerCell("Оценка"), headerCell("Баллов")],
      }),
      ...sorted.map(
        (b) =>
          new TableRow({
            children: [
              bodyCell(String(b.grade)),
              bodyCell(`${b.minPoints}–${b.maxPoints}`),
            ],
          }),
      ),
    ],
  });
}

export async function buildAssessmentDocx(
  paper: AssessmentPaperRow,
): Promise<ArrayBuffer> {
  const c = paper.content;
  const total = c.tasks.reduce((s, t) => s + (t.points || 0), 0);
  const kindFull =
    paper.kind === "sor"
      ? "Суммативное оценивание за раздел (СОР)"
      : "Суммативное оценивание за четверть (СОЧ)";

  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: paper.title, bold: true, size: 32 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: kindFull, italics: true })],
    }),
    p(""),
    metaTable(paper, total),
    p(""),
  );

  if (c.instructions) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "Инструкция для ученика" })],
      }),
      p(c.instructions),
      p(""),
    );
  }

  if (c.learningObjectives.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "Цели обучения" })],
      }),
    );
    for (const o of c.learningObjectives) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [
            new TextRun({ text: `${o.code} — `, bold: true }),
            new TextRun({ text: o.text }),
          ],
        }),
      );
    }
    children.push(p(""));
  }

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "Задания" })],
    }),
  );
  for (const t of c.tasks) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Задание ${t.number}.`, bold: true }),
          new TextRun({
            text: ` [${TASK_TYPE_LABEL_RU[t.type] ?? t.type}] ${t.learningObjectiveCode} · ${t.points} б.`,
            italics: true,
          }),
        ],
      }),
      p(t.text),
    );
    if (t.descriptors.length > 0) {
      for (const d of t.descriptors) {
        children.push(
          new Paragraph({
            bullet: { level: 1 },
            children: [new TextRun({ text: d, italics: true, size: 18 })],
          }),
        );
      }
    }
    children.push(p(""));
  }

  if (c.criteria.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "Критерии оценивания" })],
      }),
      criteriaTable(c),
      p(""),
    );
  }

  if (c.gradeBoundaries.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: "Шкала перевода в 5-балльную оценку" })],
      }),
      gradeBoundariesTable(c),
      p(""),
    );
  }

  // Page break before keys — they're for the teacher only.
  children.push(
    new Paragraph({
      children: [new PageBreak()],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: "Ключи (для учителя)" })],
    }),
  );
  for (const t of c.tasks) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `Задание ${t.number}.`, bold: true })],
      }),
      p(t.answerKey || "—"),
      p(""),
    );
  }

  const doc = new Document({
    creator: "KSP App",
    title: paper.title,
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  // Copy to a fresh ArrayBuffer in case the underlying allocator returned a
  // SharedArrayBuffer (which TS narrows away from the ArrayBuffer signature).
  const out = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(out).set(buffer);
  return out;
}
