import {
  AlignmentType, Document, HeadingLevel, Packer, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import type { LongTermPlan, MediumTermPlan } from "@/lib/longterm";

export async function buildMediumTermDocx(
  mediumPlan: MediumTermPlan,
  longTermPlan: LongTermPlan,
): Promise<Buffer> {
  const labels = ["№", "Тема", "Часы", "КСП"];
  const widths = [6, 50, 10, 34];

  const row = (values: string[], header = false) =>
    new TableRow({
      tableHeader: header,
      cantSplit: true,
      children: values.map(
        (text, index) =>
          new TableCell({
            width: { size: widths[index], type: WidthType.PERCENTAGE },
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
            ...(header
              ? { shading: { type: ShadingType.CLEAR, fill: "F2F4F6" } }
              : {}),
            children: text.split("\n").map(
              (line) =>
                new Paragraph({
                  children: [new TextRun({ text: line, bold: header })],
                }),
            ),
          }),
      ),
    });

  const totalHours = mediumPlan.topics.reduce((sum, t) => sum + t.hours, 0);
  const totalKsp = mediumPlan.topics.reduce((sum, t) => sum + t.kspIds.length, 0);

  return Packer.toBuffer(
    new Document({
      creator: "Mekty",
      title: mediumPlan.title,
      description: "Среднесрочный план (ССП)",
      styles: {
        default: {
          document: {
            run: { font: "Arial", size: 20, color: "000000" },
            paragraph: { spacing: { line: 312, after: 60 } },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 11906, height: 16838 },
              margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
            },
          },
          children: [
            new Paragraph({
              text: "Среднесрочный план (ССП)",
              heading: HeadingLevel.HEADING_1,
              keepNext: true,
            }),
            new Paragraph({ text: mediumPlan.title, keepNext: true }),
            new Paragraph({
              text: `Предмет: ${longTermPlan.subject} · Класс: ${longTermPlan.grade} · Четверть: ${mediumPlan.quarter}`,
              keepNext: true,
            }),
            new Paragraph({
              text: `Всего тем: ${mediumPlan.topics.length} · Часов: ${totalHours} · КСП: ${totalKsp}`,
              keepNext: true,
            }),
            new Paragraph({ text: "", spacing: { after: 200 } }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                row(labels, true),
                ...mediumPlan.topics.map((topic, index) =>
                  row([
                    String(index + 1),
                    topic.title,
                    String(topic.hours),
                    topic.kspIds.length > 0
                      ? topic.kspIds.map((id) => `КСП ${id.slice(-6)}`).join("\n")
                      : "—",
                  ]),
                ),
              ],
            }),
          ],
        },
      ],
    }),
  );
}
