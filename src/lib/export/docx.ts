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
import { htmlToDocxParagraphsAsync } from "./html-to-docx";

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

function p(text: string, opts?: { bold?: boolean; italics?: boolean }): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: opts?.bold, italics: opts?.italics })],
  });
}

function pBold(label: string, value: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: label, bold: true }),
      new TextRun({ text: value || "—" }),
    ],
  });
}

function bulletItems(items: string[]): Paragraph[] {
  return items.map(
    (item) =>
      new Paragraph({
        text: item,
        bullet: { level: 0 },
      }),
  );
}

function cellTextOnly(text: string, opts?: { bold?: boolean; width?: number }) {
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

function cellChildren(
  children: Paragraph[],
  opts?: { bold?: boolean; width?: number },
) {
  return new TableCell({
    borders: BORDERS,
    width: opts?.width
      ? { size: opts.width, type: WidthType.PERCENTAGE }
      : undefined,
    children: children.length > 0 ? children : [new Paragraph({ text: "—" })],
  });
}

function labelRow(label: string, value: string) {
  return new TableRow({
    children: [
      cellTextOnly(label, { bold: true, width: 30 }),
      cellTextOnly(value, { width: 70 }),
    ],
  });
}

/** Build "teacher actions" cell content with structure: key questions, actions, tasks. */
async function teacherCellChildren(stage: LessonStage): Promise<Paragraph[]> {
  const out: Paragraph[] = [];
  out.push(...(await htmlToDocxParagraphsAsync(stage.teacherActions)));
  const kq = stage.keyQuestions?.filter((q) => q.trim()) ?? [];
  if (kq.length > 0) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: "Ключевые вопросы:", bold: true })],
        spacing: { before: 80 },
      }),
      ...bulletItems(kq),
    );
  }
  const tasks = stage.tasks ?? [];
  if (tasks.length > 0) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: "Задания:", bold: true })],
        spacing: { before: 80 },
      }),
    );
    tasks.forEach((task, i) => {
      out.push(...renderTask(task, i + 1));
    });
  }
  if (stage.summary?.trim()) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: "Итог урока:", bold: true })],
        spacing: { before: 80 },
      }),
      new Paragraph({ text: stage.summary }),
    );
  }
  if (stage.homework?.trim()) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: "Домашнее задание:", bold: true })],
        spacing: { before: 80 },
      }),
      new Paragraph({ text: stage.homework }),
    );
  }
  const rq = stage.reflectionQuestions?.filter((q) => q.trim()) ?? [];
  if (rq.length > 0) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: "Рефлексия:", bold: true })],
        spacing: { before: 80 },
      }),
      ...bulletItems(rq),
    );
  }
  return out;
}

async function studentCellChildren(stage: LessonStage): Promise<Paragraph[]> {
  return htmlToDocxParagraphsAsync(stage.studentActions);
}

function assessmentCellChildren(stage: LessonStage): Paragraph[] {
  const out: Paragraph[] = [];
  const desc = stage.descriptors?.filter((d) => d.trim()) ?? [];
  if (desc.length > 0) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: "Дескрипторы (этап):", bold: true })],
      }),
      ...desc.map(
        (d) =>
          new Paragraph({
            children: [
              new TextRun({ text: "Дескриптор: ", italics: true }),
              new TextRun({ text: d }),
            ],
          }),
      ),
    );
  }
  // Per-task descriptors — surfaced by referencing task number
  const tasksWithDesc =
    stage.tasks?.filter((t) => (t.descriptors?.length ?? 0) > 0) ?? [];
  if (tasksWithDesc.length > 0) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: "Дескрипторы к заданиям:", bold: true })],
        spacing: { before: 80 },
      }),
    );
    tasksWithDesc.forEach((task) => {
      const taskNum = (stage.tasks?.indexOf(task) ?? 0) + 1;
      out.push(
        new Paragraph({
          children: [
            new TextRun({ text: `Задание ${taskNum}: `, italics: true }),
            new TextRun({ text: task.question.slice(0, 50), italics: true }),
          ],
        }),
        ...(task.descriptors ?? []).map(
          (d) =>
            new Paragraph({
              bullet: { level: 0 },
              children: [new TextRun({ text: d })],
            }),
        ),
      );
    });
  }
  if (stage.assessmentMethod?.trim()) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: "Метод: ", bold: true })],
        spacing: { before: 80 },
      }),
      new Paragraph({ text: stage.assessmentMethod }),
    );
  }
  return out;
}

async function stageRow(label: string, stage: LessonStage): Promise<TableRow> {
  const stageCell = new Paragraph({
    children: [
      new TextRun({ text: label, bold: true }),
      ...(stage.time ? [new TextRun({ text: `\n${stage.time}` })] : []),
    ],
  });
  const [teacher, student] = await Promise.all([
    teacherCellChildren(stage),
    studentCellChildren(stage),
  ]);
  return new TableRow({
    children: [
      cellChildren([stageCell], { width: 14 }),
      cellChildren(teacher, { width: 32 }),
      cellChildren(student, { width: 22 }),
      cellChildren(assessmentCellChildren(stage), { width: 18 }),
      cellChildren(
        stage.resources
          ? stage.resources
              .split(/\n+/)
              .filter((s) => s.trim())
              .map((line) => new Paragraph({ text: line }))
          : [],
        { width: 14 },
      ),
    ],
  });
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
      task.pairs.forEach((pair) => {
        body.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `   ${task.left[pair.leftIndex] ?? ""} ↔ ${task.right[pair.rightIndex] ?? ""}`,
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
    case "NUMERIC":
      body.push(
        new Paragraph({
          children: [
            new TextRun({
              text:
                `   Ответ: ${task.answer}${task.unit ? ` ${task.unit}` : ""}` +
                (task.tolerance > 0 ? ` (допуск ±${task.tolerance})` : ""),
            }),
          ],
        }),
      );
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

export interface BuildKspDocxOptions {
  series?: { title: string; total?: number } | null;
}

export async function buildKspDocx(
  plan: LessonPlanRow,
  options: BuildKspDocxOptions = {},
): Promise<Buffer> {
  const c = plan.content;

  const headerRows = [
    labelRow("Раздел долгосрочного плана", c.header.longTermPlanSection),
    labelRow("Школа", c.header.school),
    labelRow("Дата", c.header.date),
    labelRow("ФИО учителя", c.header.teacherName),
    labelRow("Класс", c.header.grade),
    labelRow(
      "Присутствовало / Отсутствовало",
      `${c.header.studentsPresent ?? "—"} / ${c.header.studentsAbsent ?? "—"}`,
    ),
    labelRow("Тема урока", c.topic),
  ];

  if (options.series && plan.series_position) {
    const total = options.series.total;
    const lessonLabel = total
      ? `Урок ${plan.series_position} из ${total}`
      : `Урок ${plan.series_position}`;
    headerRows.push(
      labelRow(
        "Серия уроков",
        `${options.series.title} · ${lessonLabel}`,
      ),
    );
  }

  // === Шапка КСП (table label/value) ===
  const header = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: headerRows,
  });

  // === Большая таблица «Ход урока» — 5 колонок ===
  const flow = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          cellTextOnly("Этап урока", { bold: true, width: 14 }),
          cellTextOnly("Действия педагога", { bold: true, width: 32 }),
          cellTextOnly("Действия ученика", { bold: true, width: 22 }),
          cellTextOnly("Оценивание", { bold: true, width: 18 }),
          cellTextOnly("Ресурсы", { bold: true, width: 14 }),
        ],
      }),
      ...(await Promise.all([
        stageRow("Начало урока", c.stages.beginning),
        stageRow("Середина урока", c.stages.middle),
        stageRow("Конец урока", c.stages.end),
      ])),
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
            text: "Краткосрочный (поурочный) план",
            heading: HeadingLevel.HEADING_2,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: plan.title,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
          }),
          header,

          new Paragraph({
            text: "Цели обучения в соответствии с учебной программой",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 100 },
          }),
          ...(c.learningObjectives.length > 0
            ? bulletItems(
                c.learningObjectives.map(
                  (o) => `${o.code ? `${o.code} — ` : ""}${o.text}`,
                ),
              )
            : [p("—")]),

          new Paragraph({
            text: "Цели урока",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 100 },
          }),
          ...(c.lessonObjectives.length > 0
            ? bulletItems(c.lessonObjectives)
            : [p("—")]),

          new Paragraph({
            text: "Критерии оценивания",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 100 },
          }),
          ...(c.assessmentCriteria.length > 0
            ? bulletItems(c.assessmentCriteria)
            : [p("—")]),

          new Paragraph({
            text: "Языковые цели",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 100 },
          }),
          pBold(
            "Термины: ",
            c.languageObjectives.terms.join(", ") || "—",
          ),
          pBold(
            "Ключевые фразы: ",
            c.languageObjectives.phrases.join("; ") || "—",
          ),

          new Paragraph({
            text: "Привитие ценностей",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 100 },
          }),
          p(c.values || "—"),

          new Paragraph({
            text: "Межпредметные связи",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 },
          }),
          p(c.crossCurricularLinks || "—"),

          new Paragraph({
            text: "Предшествующие знания",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 },
          }),
          p(c.priorKnowledge || "—"),

          new Paragraph({
            text: "Ход урока",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 150 },
          }),
          flow,

          new Paragraph({
            text: "Дифференциация / Здоровье и ТБ / Рефлексия учителя",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 100 },
          }),
          pBold(
            "Формативное оценивание: ",
            c.evaluation.formativeAssessment || "—",
          ),
          pBold("Дифференциация: ", c.evaluation.differentiation || "—"),
          pBold("Здоровье и ТБ: ", c.evaluation.healthAndSafety || "—"),
          pBold("Рефлексия учителя: ", c.evaluation.reflection || "—"),
        ],
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
