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
  Footer,
} from "docx";
import type { LessonPlanRow, LessonStage } from "@/lib/types/ksp";
import { type InteractiveTask, taskTypeLabel } from "@/lib/ksp/tasks";

function pluralPoints(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 14) return `${n} баллов`;
  if (last === 1) return `${n} балл`;
  if (last >= 2 && last <= 4) return `${n} балла`;
  return `${n} баллов`;
}

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
function teacherCellChildren(stage: LessonStage): Paragraph[] {
  const out: Paragraph[] = [];
  if (stage.teacherActions.trim()) {
    out.push(
      ...stage.teacherActions
        .split(/\n+/)
        .filter((s) => s.trim())
        .map((line) => new Paragraph({ text: line })),
    );
  }
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

function studentCellChildren(stage: LessonStage): Paragraph[] {
  const out: Paragraph[] = [];
  if (stage.studentActions.trim()) {
    out.push(
      ...stage.studentActions
        .split(/\n+/)
        .filter((s) => s.trim())
        .map((line) => new Paragraph({ text: line })),
    );
  }
  return out;
}

function assessmentCellChildren(stage: LessonStage): Paragraph[] {
  const out: Paragraph[] = [];
  const desc = stage.descriptors?.filter((d) => d.trim()) ?? [];
  if (desc.length > 0) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: "Дескрипторы:", bold: true })],
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
  if (stage.assessmentMethod?.trim()) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: "Метод: ", bold: true })],
      }),
      new Paragraph({ text: stage.assessmentMethod }),
    );
  }
  return out;
}

function stageRow(label: string, stage: LessonStage): TableRow {
  const stageCell = new Paragraph({
    children: [
      new TextRun({ text: label, bold: true }),
      ...(stage.time ? [new TextRun({ text: `\n${stage.time}` })] : []),
    ],
  });
  return new TableRow({
    children: [
      cellChildren([stageCell], { width: 14 }),
      cellChildren(teacherCellChildren(stage), { width: 32 }),
      cellChildren(studentCellChildren(stage), { width: 22 }),
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
        text: ` (${pluralPoints(task.points)})`,
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

/** Колонтитул с пометкой бесплатного тарифа; null — не нужен (Pro/демо-режим решает вызывающий). */
export function buildFreeWatermarkFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: "Создано в Mekty — бесплатный тариф · уберите пометку с Pro: mekty.kz",
            size: 16,
            color: "999999",
          }),
        ],
      }),
    ],
  });
}

export async function buildKspDocx(
  plan: LessonPlanRow,
  options: { watermark?: boolean } = {},
): Promise<Buffer> {
  const c = plan.content;
  const watermark = options.watermark ? buildFreeWatermarkFooter() : null;

  // === Шапка КСП (table label/value) ===
  const header = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      labelRow("Раздел долгосрочного плана", c.header.longTermPlanSection),
      labelRow("Школа", c.header.school),
      labelRow(
        "Профиль школы",
        c.schoolProfile === "emn"
          ? "ЕМН (естественно-математическое направление)"
          : c.schoolProfile === "ogn"
            ? "ОГН (общественно-гуманитарное направление)"
            : "—",
      ),
      labelRow("Дата", c.header.date),
      labelRow("ФИО учителя", c.header.teacherName),
      labelRow("Класс", c.header.grade),
      labelRow(
        "Присутствовало / Отсутствовало",
        `${c.header.studentsPresent ?? "—"} / ${c.header.studentsAbsent ?? "—"}`,
      ),
      labelRow("Тема урока", c.topic),
    ],
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
      stageRow("Начало урока", c.stages.beginning),
      stageRow("Середина урока", c.stages.middle),
      stageRow("Конец урока", c.stages.end),
    ],
  });

  const doc = new Document({
    creator: "КСП App",
    title: plan.title,
    description: "Краткосрочный план урока",
    sections: [
      {
        properties: {},
        ...(watermark ? { footers: { default: watermark } } : {}),
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

/** Отдельный Word-сценарий с полной речью педагога для проведения урока. */
export async function buildTeacherScriptDocx(
  plan: LessonPlanRow,
  options: { watermark?: boolean } = {},
): Promise<Buffer> {
  const c = plan.content;
  const watermark = options.watermark ? buildFreeWatermarkFooter() : null;
  const stages: Array<{ title: string; stage: LessonStage }> = [
    { title: "Начало урока", stage: c.stages.beginning },
    { title: "Середина урока", stage: c.stages.middle },
    { title: "Конец урока", stage: c.stages.end },
  ];
  const children: Paragraph[] = [
    new Paragraph({ text: "Слова педагога", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
    new Paragraph({ text: plan.title, alignment: AlignmentType.CENTER, spacing: { after: 180 } }),
    pBold("Тема урока: ", c.topic || "—"),
    pBold("Класс: ", c.header.grade || String(plan.grade)),
  ];

  for (const { title, stage } of stages) {
    children.push(new Paragraph({
      text: `${title}${stage.time ? ` (${stage.time})` : ""}`,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 300, after: 100 },
    }));
    const lines = stage.teacherActions.split(/\n+/).filter((line) => line.trim());
    children.push(...(lines.length ? lines.map((line) => p(line.trim())) : [p("Сценарий педагога пока не заполнен.")]));
    if (stage.keyQuestions?.length) {
      children.push(new Paragraph({ text: "Ключевые вопросы", heading: HeadingLevel.HEADING_3, spacing: { before: 160, after: 60 } }));
      children.push(...bulletItems(stage.keyQuestions));
    }
    if (stage.homework) children.push(pBold("Домашнее задание: ", stage.homework));
  }

  const doc = new Document({
    creator: "КСП App",
    title: `Слова педагога - ${plan.title}`,
    description: "Подробный сценарий речи педагога",
    sections: [{
      properties: {},
      ...(watermark ? { footers: { default: watermark } } : {}),
      children,
    }],
  });
  return Packer.toBuffer(doc);
}
