import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { formatMathPlain } from "@/lib/math/render-math";

const NAVY = "1E3A8A";
const MUTED = "475569";
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "94A3B8" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function parseInlineRuns(line: string, size = 22): TextRun[] {
  const clean = formatMathPlain(line);
  const parts = clean.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return new TextRun({ text: part.slice(2, -2), bold: true, size });
    }
    return new TextRun({ text: part.replace(/\*/g, ""), size });
  });
}

function buildMarkdownTable(tableLines: string[]): Table | null {
  const rows = tableLines
    .map((line) =>
      line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim()),
    )
    .filter((cells) => cells.length > 0 && !cells.every((c) => /^[-:\s]+$/.test(c)));

  if (rows.length === 0) return null;
  const colCount = Math.max(...rows.map((r) => r.length));
  const widthPct = Math.max(8, Math.floor(100 / colCount));

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (cells, rIdx) =>
        new TableRow({
          children: Array.from({ length: colCount }, (_, cIdx) => {
            const val = cells[cIdx] ?? "";
            const isHeader = rIdx === 0;
            return new TableCell({
              borders: BORDERS,
              width: { size: widthPct, type: WidthType.PERCENTAGE },
              ...(isHeader ? { shading: { type: ShadingType.CLEAR, fill: "E2E8F0" } } : {}),
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: formatMathPlain(val.replace(/\*\*/g, "")),
                      bold: isHeader,
                      size: 19,
                    }),
                  ],
                }),
              ],
            });
          }),
        }),
    ),
  });
}

export interface OfficialDocxInput {
  title: string;
  subtitle?: string;
  content: string;
  schoolName?: string | null;
  teacherName?: string | null;
  language?: "ru" | "kz";
}

/**
 * Собирает официальный печатный документ Word (.docx) из Markdown-отчёта школьного ИИ-конструктора
 * (анализ СОР/СОЧ, справка ВШК, характеристика, протокол собрания, маршрут ИОМ).
 */
export async function buildOfficialMarkdownDocx(input: OfficialDocxInput): Promise<Buffer> {
  const isKz = input.language === "kz";
  const children: (Paragraph | Table)[] = [];

  if (input.schoolName) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [new TextRun({ text: input.schoolName, bold: true, size: 22, color: NAVY })],
      }),
    );
  }

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: input.title, bold: true, size: 28, color: NAVY })],
    }),
  );

  if (input.subtitle) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: input.subtitle, italics: true, size: 20, color: MUTED })],
      }),
    );
  }

  const lines = input.content.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i]!;
    const trimmed = raw.trim();

    if (!trimmed || /^---+$/.test(trimmed)) {
      i++;
      continue;
    }

    // Таблица Markdown
    if (trimmed.startsWith("|") && trimmed.includes("|", 1)) {
      const tableBuf: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith("|")) {
        tableBuf.push(lines[i]!);
        i++;
      }
      const tbl = buildMarkdownTable(tableBuf);
      if (tbl) {
        children.push(tbl);
        children.push(new Paragraph({ text: "" }));
      }
      continue;
    }

    // Заголовки
    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      const level = hMatch[1]!.length;
      const text = hMatch[2]!.replace(/\*\*/g, "").trim();
      children.push(
        new Paragraph({
          heading:
            level === 1
              ? HeadingLevel.HEADING_1
              : level === 2
                ? HeadingLevel.HEADING_2
                : HeadingLevel.HEADING_3,
          spacing: { before: 220, after: 100 },
          children: [
            new TextRun({
              text: formatMathPlain(text),
              bold: true,
              size: level === 1 ? 26 : level === 2 ? 24 : 22,
              color: NAVY,
            }),
          ],
        }),
      );
      i++;
      continue;
    }

    // Маркированный список
    const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (bulletMatch) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 60 },
          children: parseInlineRuns(bulletMatch[1]!, 21),
        }),
      );
      i++;
      continue;
    }

    // Нумерованный список
    const numMatch = trimmed.match(/^(\d+[.)])\s+(.+)$/);
    if (numMatch) {
      children.push(
        new Paragraph({
          spacing: { after: 70 },
          indent: { left: 240 },
          children: [
            new TextRun({ text: `${numMatch[1]} `, bold: true, size: 21, color: NAVY }),
            ...parseInlineRuns(numMatch[2]!, 21),
          ],
        }),
      );
      i++;
      continue;
    }

    children.push(
      new Paragraph({
        spacing: { after: 100 },
        children: parseInlineRuns(trimmed, 22),
      }),
    );
    i++;
  }

  // Подпись и дата внизу официального документа
  const today = new Date().toLocaleDateString(isKz ? "kk-KZ" : "ru-RU");
  children.push(
    new Paragraph({
      spacing: { before: 360 },
      children: [
        new TextRun({
          text: isKz
            ? `Күні: ${today} ж.          Қолы: ____________________ ${input.teacherName ? `(${input.teacherName})` : ""}`
            : `Дата: ${today} г.          Подпись: ____________________ ${input.teacherName ? `(${input.teacherName})` : ""}`,
          size: 20,
          color: MUTED,
        }),
      ],
    }),
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 900, bottom: 900, left: 1080, right: 800 } },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
