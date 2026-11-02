import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { TeacherSpeech } from "./generate";

const TITLES = { beginning: "Начало урока", middle: "Середина урока", end: "Конец урока" } as const;

/** Word-документ со словами педагога: реплики по этапам, действия и ожидаемые ответы курсивом. */
export function buildSpeechDocx(planTitle: string, topic: string, speech: TeacherSpeech): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ text: "Слова педагога", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
    new Paragraph({ text: planTitle, alignment: AlignmentType.CENTER, spacing: { after: 180 } }),
    new Paragraph({ children: [new TextRun({ text: "Тема урока: ", bold: true }), new TextRun(topic || "—")] }),
  ];

  for (const stage of speech.stages) {
    children.push(
      new Paragraph({
        text: `${TITLES[stage.stage]}${stage.time ? ` (${stage.time})` : ""}`,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 100 },
      }),
    );
    for (const line of stage.lines) {
      children.push(new Paragraph({ children: [new TextRun(line.say)], spacing: { after: 80 } }));
      if (line.action) {
        children.push(new Paragraph({ children: [new TextRun({ text: `Действие: ${line.action}`, italics: true, color: "666666" })], spacing: { after: 60 } }));
      }
      if (line.expected) {
        children.push(new Paragraph({ children: [new TextRun({ text: `Ожидаемый ответ: ${line.expected}`, italics: true, color: "2F6B3A" })], spacing: { after: 100 } }));
      }
    }
  }

  return Packer.toBuffer(
    new Document({
      creator: "КСП App",
      title: `Слова педагога - ${planTitle}`,
      description: "Сценарий речи педагога по этапам урока",
      sections: [{ children }],
    }),
  );
}
