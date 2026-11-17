import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
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
import type { GroupCard, GroupWork } from "./group-work";

const NAVY = "2B2D83";
const HEADER_BLUE = "E0ECFF";
const SITUATION_BG = "FFF7ED";
const VALUE_BG = "ECFDF5";
const MUTED = "595959";

const CARD_BORDER = { style: BorderStyle.SINGLE, size: 8, color: "93C5FD" };
const CARD_BORDERS = {
  top: CARD_BORDER,
  bottom: CARD_BORDER,
  left: CARD_BORDER,
  right: CARD_BORDER,
};

/**
 * Экспорт карточек групповой или парной работы в печатный документ Word (.docx).
 * Каждая группа/пара размещается на отдельной странице, чтобы карточки можно было сразу раздать классу.
 */
export async function buildGroupWorkDocx(
  work: GroupWork,
  options: { watermark?: boolean } = {},
): Promise<Buffer> {
  const isKz = work.language === "kz";
  const unitLabel =
    work.mode === "pair"
      ? isKz
        ? "Жұп"
        : "Пара"
      : isKz
        ? "Топ"
        : "Группа";
  const situationLabel = isKz ? "Жағдаят" : "Ситуация";
  const tasksLabel = isKz
    ? "Тапсырмалар"
    : work.mode === "pair"
      ? "Задания для пары"
      : "Задания для группы";
  const valueLabel = isKz ? "Сабақ құндылығы" : "Ценность урока";

  const children: (Paragraph | Table)[] = [];

  work.cards.forEach((card: GroupCard, idx: number) => {
    children.push(
      new Paragraph({
        pageBreakBefore: idx > 0,
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 120 },
        shading: { type: ShadingType.CLEAR, fill: HEADER_BLUE },
        children: [
          new TextRun({
            text: `  ${unitLabel} ${idx + 1}. ${card.title}`,
            bold: true,
            size: 28,
            color: NAVY,
          }),
        ],
      }),
    );

    if (card.note) {
      children.push(
        new Paragraph({
          spacing: { after: 140 },
          children: [
            new TextRun({ text: card.note, italics: true, size: 20, color: MUTED }),
          ],
        }),
      );
    }

    // Блок ситуации
    const situationParagraphs: Paragraph[] = [
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: `${situationLabel}:`, bold: true, size: 22, color: "9A3412" })],
      }),
      ...card.situation.map(
        (line) =>
          new Paragraph({
            spacing: { after: 80 },
            children: [new TextRun({ text: line, size: 21 })],
          }),
      ),
    ];

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            cantSplit: true,
            children: [
              new TableCell({
                borders: CARD_BORDERS,
                shading: { type: ShadingType.CLEAR, fill: SITUATION_BG },
                margins: { top: 140, bottom: 140, left: 180, right: 180 },
                children: situationParagraphs,
              }),
            ],
          }),
        ],
      }),
    );

    children.push(
      new Paragraph({
        spacing: { before: 200, after: 100 },
        children: [new TextRun({ text: `${tasksLabel}:`, bold: true, size: 24, color: NAVY })],
      }),
    );

    card.tasks.forEach((task, tIdx) => {
      children.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({ text: `${tIdx + 1}. `, bold: true, size: 22, color: NAVY }),
            new TextRun({ text: task.text, size: 22 }),
          ],
        }),
      );
      if (task.schema && task.schema.length > 0) {
        children.push(
          new Paragraph({
            spacing: { after: 120 },
            indent: { left: 360 },
            children: [
              new TextRun({
                text: `Схема: ${task.schema.join("  →  ")}`,
                bold: true,
                size: 20,
                color: "1D4ED8",
              }),
            ],
          }),
        );
      }
    });

    if (card.value) {
      children.push(
        new Paragraph({
          spacing: { before: 160, after: 80 },
          shading: { type: ShadingType.CLEAR, fill: VALUE_BG },
          children: [
            new TextRun({ text: `💡 ${valueLabel}: `, bold: true, size: 20, color: "065F46" }),
            new TextRun({ text: card.value, size: 20, color: "065F46" }),
          ],
        }),
      );
    }

    if (card.slogan) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { before: 100 },
          children: [new TextRun({ text: card.slogan, bold: true, italics: true, size: 20, color: NAVY })],
        }),
      );
    }
  });

  const footers = options.watermark
    ? {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: "Создано в Mekty — бесплатный тариф",
                  size: 14,
                  color: MUTED,
                  italics: true,
                }),
              ],
            }),
          ],
        }),
      }
    : undefined;

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } },
        },
        ...(footers ? { footers } : {}),
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
