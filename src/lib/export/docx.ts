import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  TextRun,
  AlignmentType,
  WidthType,
  BorderStyle,
} from "docx";
import type { LessonPlanRow, LessonStage } from "@/lib/types/ksp";
import { type InteractiveTask, taskTypeLabel } from "@/lib/ksp/tasks";

const BORDER = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: "666666",
};
const BORDERS = {
  top: BORDER,
  bottom: BORDER,
  left: BORDER,
  right: BORDER,
};

function cell(text: string, opts?: { bold?: boolean; width?: number }) {
  return new TableCell({
    borders: BORDERS,
    width: opts?.width
      ? { size: opts.width, type: WidthType.PERCENTAGE }
      : undefined,
    children: [
      new Paragraph({
        children: [new TextRun({ text: text || "—", bold: opts?.bold })],
      }),
    ],
  });
}

function labelRow(label: string, value: string) {
  return new TableRow({
    children: [
      cell(label, { bold: true, width: 30 }),
      cell(value, { width: 70 }),
    ],
  });
}

function bulletList(items: string[]): Paragraph[] {
  if (items.length === 0) return [new Paragraph({ text: "—" })];
  return items.map(
    (item) =>
      new Paragraph({
        text: item,
        bullet: { level: 0 },
      }),
  );
}

function stageTable(title: string, stage: LessonStage) {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 200, after: 100 },
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            cell("Время", { bold: true, width: 15 }),
            cell("Действия учителя", { bold: true, width: 40 }),
            cell("Действия учеников", { bold: true, width: 30 }),
            cell("Ресурсы", { bold: true, width: 15 }),
          ],
        }),
        new TableRow({
          children: [
            cell(stage.time),
            cell(stage.teacherActions),
            cell(stage.studentActions),
            cell(stage.resources),
          ],
        }),
      ],
    }),
  ];

  const tasks = stage.tasks ?? [];
  if (tasks.length > 0) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Интерактивные задания этапа:", bold: true }),
        ],
        spacing: { before: 150, after: 50 },
      }),
    );
    tasks.forEach((task, i) => {
      children.push(...renderTask(task, i + 1));
    });
  }
  return children;
}

function renderTask(task: InteractiveTask, n: number): Paragraph[] {
  const head = new Paragraph({
    spacing: { before: 100 },
    children: [
      new TextRun({ text: `${n}. [${taskTypeLabel(task.type)}] `, bold: true }),
      new TextRun({ text: task.question || "—" }),
      new TextRun({
        text: ` (${task.points} ${task.points === 1 ? "балл" : "балла"})`,
        italics: true,
      }),
    ],
  });
  const body: Paragraph[] = [head];

  switch (task.type) {
    case "MCQ":
      task.options.forEach((opt, i) => {
        const marker = i === task.correctIndex ? "✓" : "○";
        body.push(
          new Paragraph({
            children: [new TextRun({ text: `   ${marker} ${opt}` })],
          }),
        );
      });
      break;
    case "TRUE_FALSE":
      body.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `   Правильный ответ: ${task.correct ? "Верно" : "Неверно"}`,
            }),
          ],
        }),
      );
      break;
    case "SHORT_ANSWER":
      body.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `   Ожидаемый ответ: ${task.acceptedAnswers.join(" / ") || "—"}`,
            }),
          ],
        }),
      );
      break;
    case "FILL_BLANK":
      body.push(
        new Paragraph({
          children: [new TextRun({ text: `   ${task.template}` })],
        }),
      );
      body.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `   Ответы: ${task.answers.join(", ")}`,
              italics: true,
            }),
          ],
        }),
      );
      break;
    case "MATCHING":
      task.pairs.forEach((p) => {
        body.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `   ${task.left[p.leftIndex] ?? ""} ↔ ${task.right[p.rightIndex] ?? ""}`,
              }),
            ],
          }),
        );
      });
      break;
    case "ORDERING":
      task.correctOrder.forEach((idx, pos) => {
        body.push(
          new Paragraph({
            children: [
              new TextRun({ text: `   ${pos + 1}. ${task.items[idx] ?? ""}` }),
            ],
          }),
        );
      });
      break;
  }

  if (task.hint) {
    body.push(
      new Paragraph({
        children: [
          new TextRun({ text: `   Подсказка: ${task.hint}`, italics: true }),
        ],
      }),
    );
  }
  return body;
}

export async function buildKspDocx(plan: LessonPlanRow): Promise<Buffer> {
  const c = plan.content;

  const header = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      labelRow("Раздел долгосрочного плана", c.header.longTermPlanSection),
      labelRow("Школа", c.header.school),
      labelRow("Дата", c.header.date),
      labelRow("ФИО учителя", c.header.teacherName),
      labelRow("Класс", c.header.grade),
      labelRow(
        "Участвовало / Отсутствовало",
        `${c.header.studentsPresent ?? "—"} / ${c.header.studentsAbsent ?? "—"}`,
      ),
      labelRow("Тема урока", c.topic),
    ],
  });

  const doc = new Document({
    creator: "КСП App",
    title: plan.title,
    description: "Краткосрочный план урока",
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: plan.title,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
          }),
          header,

          new Paragraph({
            text: "Цели обучения",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 100 },
          }),
          ...bulletList(
            c.learningObjectives.map(
              (o) => `${o.code ? `${o.code} — ` : ""}${o.text}`,
            ),
          ),

          new Paragraph({
            text: "Цели урока",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 100 },
          }),
          ...bulletList(c.lessonObjectives),

          new Paragraph({
            text: "Критерии оценивания",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 100 },
          }),
          ...bulletList(c.assessmentCriteria),

          new Paragraph({
            text: "Языковые цели",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Термины: ", bold: true }),
              new TextRun({
                text: c.languageObjectives.terms.join(", ") || "—",
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Ключевые фразы: ", bold: true }),
              new TextRun({
                text: c.languageObjectives.phrases.join("; ") || "—",
              }),
            ],
          }),

          new Paragraph({
            text: "Привитие ценностей",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 100 },
          }),
          new Paragraph({ text: c.values || "—" }),

          new Paragraph({
            text: "Межпредметные связи",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 },
          }),
          new Paragraph({ text: c.crossCurricularLinks || "—" }),

          new Paragraph({
            text: "Предшествующие знания",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 },
          }),
          new Paragraph({ text: c.priorKnowledge || "—" }),

          new Paragraph({
            text: "Ход урока",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 100 },
          }),
          ...stageTable("Начало урока", c.stages.beginning),
          ...stageTable("Середина урока", c.stages.middle),
          ...stageTable("Конец урока", c.stages.end),

          new Paragraph({
            text: "Оценивание и рефлексия",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Формативное оценивание: ", bold: true }),
              new TextRun({ text: c.evaluation.formativeAssessment || "—" }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Дифференциация: ", bold: true }),
              new TextRun({ text: c.evaluation.differentiation || "—" }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Здоровье и ТБ: ", bold: true }),
              new TextRun({ text: c.evaluation.healthAndSafety || "—" }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Рефлексия: ", bold: true }),
              new TextRun({ text: c.evaluation.reflection || "—" }),
            ],
          }),
        ],
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
