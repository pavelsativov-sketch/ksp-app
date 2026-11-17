import { z } from "zod";
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
import { executeWithFallback } from "@/lib/ai/providers";
import { extractJson } from "@/lib/ai/extract-json";
import { formatMathPlain } from "@/lib/math/render-math";

export const sorTaskSchema = z.object({
  number: z.number().int().min(1).max(20),
  level: z.enum(["knowledge", "application", "higher_order"]).catch("application"),
  taskType: z.enum(["mcq", "short", "extended"]).catch("extended"),
  prompt: z.string().trim().min(3).max(2000),
  options: z.array(z.string().trim().max(400)).max(6).optional().nullable(),
  points: z.number().int().min(1).max(15),
});

export const sorDescriptorRowSchema = z.object({
  taskNumber: z.number().int().min(1).max(20),
  criterion: z.string().trim().min(2).max(400),
  steps: z.array(z.string().trim().min(2).max(400)).min(1).max(8),
  points: z.number().int().min(1).max(15),
  answerVariant1: z.string().trim().max(800).default("—"),
  answerVariant2: z.string().trim().max(800).default("—"),
});

export const sorRubricRowSchema = z.object({
  criterion: z.string().trim().min(2).max(400),
  low: z.string().trim().min(2).max(500),
  medium: z.string().trim().min(2).max(500),
  high: z.string().trim().min(2).max(500),
});

export const sorSochWorkSchema = z.object({
  title: z.string().trim().min(3).max(240),
  subject: z.string().trim().min(2).max(120),
  grade: z.number().int().min(1).max(11),
  quarter: z.number().int().min(1).max(4),
  workType: z.string().trim().min(2).max(40),
  language: z.enum(["ru", "kz"]),
  durationMinutes: z.number().int().min(15).max(90).default(25),
  maxPoints: z.number().int().min(5).max(50),
  sectionOrTopic: z.string().trim().max(300).default(""),
  learningObjectives: z.array(z.string().trim().min(2).max(500)).min(1).max(10),
  thinkingLevels: z.object({
    knowledgePercent: z.number().min(0).max(100),
    applicationPercent: z.number().min(0).max(100),
    higherOrderPercent: z.number().min(0).max(100),
  }),
  variant1: z.array(sorTaskSchema).min(3).max(10),
  variant2: z.array(sorTaskSchema).min(3).max(10),
  descriptors: z.array(sorDescriptorRowSchema).min(3).max(15),
  rubric: z.array(sorRubricRowSchema).min(1).max(8),
});

export type SorSochWork = z.infer<typeof sorSochWorkSchema>;

export interface GenerateSorSochInput {
  subject: string;
  grade: number;
  quarter: number;
  workType: string;
  language: "ru" | "kz";
  maxPoints: number;
  durationMinutes: number;
  sectionOrTopic: string;
  learningObjectives: string[];
  taskCount: number;
}

/** Гарантирует точное совпадение суммы баллов каждого варианта с maxPoints. */
function normalizeTaskPoints(
  tasks: z.infer<typeof sorTaskSchema>[],
  targetMax: number,
): z.infer<typeof sorTaskSchema>[] {
  const numbered = tasks.map((t, idx) => ({
    ...t,
    number: idx + 1,
    points: Math.max(1, Math.round(t.points)),
  }));
  let sum = numbered.reduce((acc, t) => acc + t.points, 0);
  let guard = 0;
  while (sum !== targetMax && guard < 100 && numbered.length > 0) {
    guard++;
    if (sum < targetMax) {
      // Добавляем баллы к заданиям высокого порядка / применения с конца
      const idx = (numbered.length - 1 - ((guard - 1) % numbered.length) + numbered.length) % numbered.length;
      numbered[idx]!.points += 1;
      sum += 1;
    } else {
      // Уменьшаем баллы у самого «дорогого» задания (> 1 балла)
      let maxIdx = -1;
      for (let i = 0; i < numbered.length; i++) {
        if (numbered[i]!.points > 1 && (maxIdx === -1 || numbered[i]!.points > numbered[maxIdx]!.points)) {
          maxIdx = i;
        }
      }
      if (maxIdx === -1) break;
      numbered[maxIdx]!.points -= 1;
      sum -= 1;
    }
  }
  return numbered;
}

export async function generateSorSochWork(input: GenerateSorSochInput): Promise<SorSochWork> {
  const isKz = input.language === "kz";
  const langLabel = isKz ? "на казахском языке (Қазақ тілінде)" : "на русском языке";
  const objectivesText =
    input.learningObjectives.length > 0
      ? input.learningObjectives.join("\n- ")
      : `${input.sectionOrTopic || input.subject} (${input.grade} класс)`;

  const systemPrompt = `Ты — ведущий эксперт Национальной академии образования им. И. Алтынсарина и разработчик спецификаций суммативного оценивания (СОР / СОЧ, БЖБ / ТЖБ) МП РК.
Отвечай СТРОГО валидным JSON без обёрток и комментариев. Для формул по математике, физике и химии используй компактную запись $...$ (например, $x^2 - 5x + 6 = 0$, $\\frac{3}{4}$).`;

  const userPrompt = `Разработай полный комплект суммативного оценивания (${input.workType}) ${langLabel}:
- Предмет: ${input.subject}
- Класс: ${input.grade}
- Четверть: ${input.quarter}
- Раздел / сквозная тема: ${input.sectionOrTopic || "По учебной программе четверти"}
- Время выполнения: ${input.durationMinutes} минут
- Максимальный балл: РОВНО ${input.maxPoints} баллов
- Количество заданий в каждом варианте: ${input.taskCount}
- Цели обучения ГОСО:
- ${objectivesText}

Требования стандарта критериального оценивания РК:
1. Составь ДВА равноценных параллельных варианта (variant1 и variant2) по ${input.taskCount} заданий в каждом: одинаковые типы и баллы по номерам, но разные числа/примеры/формулировки (защита от списывания).
2. Распредели задания от простого к сложному по уровням мыслительных навыков:
   - "knowledge" (знание и понимание, тест mcq с 4 вариантами в options или краткий ответ "short"),
   - "application" (применение, решение/практическая задача "short" или "extended"),
   - "higher_order" (навыки высокого порядка / анализ / оценка, развёрнутое задание "extended").
3. Сумма баллов заданий в variant1 ОБЯЗАНА быть равна ${input.maxPoints}, и в variant2 — равна ${input.maxPoints}.
4. Для каждого задания в массиве descriptors укажи:
   - taskNumber (1..${input.taskCount}),
   - criterion (критерий оценивания: «Обучающийся: ...» / «Білім алушы: ...»),
   - steps (пошаговые дескрипторы: конкретные проверяемые действия, где количество шагов соответствует баллам задания),
   - points (балл за задание),
   - answerVariant1 (точный ответ/ключ для Варианта 1),
   - answerVariant2 (точный ответ/ключ для Варианта 2).
5. В массиве rubric составь рубрику для родителей по критериям оценивания с тремя уровнями учебных достижений: low (низкий), medium (средний), high (высокий).

Верни строго JSON структуры:
{
  "title": "...",
  "thinkingLevels": { "knowledgePercent": 30, "applicationPercent": 50, "higherOrderPercent": 20 },
  "variant1": [
    { "number": 1, "level": "knowledge", "taskType": "mcq", "prompt": "...", "options": ["...", "...", "...", "..."], "points": 2 }
  ],
  "variant2": [
    { "number": 1, "level": "knowledge", "taskType": "mcq", "prompt": "...", "options": ["...", "...", "...", "..."], "points": 2 }
  ],
  "descriptors": [
    { "taskNumber": 1, "criterion": "...", "steps": ["... (1 б.)", "... (1 б.)"], "points": 2, "answerVariant1": "...", "answerVariant2": "..." }
  ],
  "rubric": [
    { "criterion": "...", "low": "...", "medium": "...", "high": "..." }
  ]
}`;

  const rawWork = await executeWithFallback(
    "generation",
    async (client, model, config) => {
      const response = await client.chat.completions.create({
        model,
        temperature: 0.35,
        max_completion_tokens: config.maxTokens ?? 8192,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });
      const content = response.choices[0]?.message?.content ?? "";
      const extracted = extractJson(content) as Record<string, unknown>;
      const candidate = {
        title:
          typeof extracted?.title === "string" && extracted.title.trim()
            ? extracted.title
            : `${input.workType} — ${input.subject}, ${input.grade} ${isKz ? "сынып" : "класс"}`,
        subject: input.subject,
        grade: input.grade,
        quarter: input.quarter,
        workType: input.workType,
        language: input.language,
        durationMinutes: input.durationMinutes,
        maxPoints: input.maxPoints,
        sectionOrTopic: input.sectionOrTopic,
        learningObjectives:
          input.learningObjectives.length > 0
            ? input.learningObjectives
            : [input.sectionOrTopic || input.subject],
        thinkingLevels: extracted?.thinkingLevels ?? {
          knowledgePercent: 30,
          applicationPercent: 50,
          higherOrderPercent: 20,
        },
        variant1: extracted?.variant1,
        variant2: extracted?.variant2,
        descriptors: extracted?.descriptors,
        rubric: extracted?.rubric,
      };
      return sorSochWorkSchema.parse(candidate);
    },
    { timeoutMs: 50_000 },
  );

  const v1 = normalizeTaskPoints(rawWork.variant1, input.maxPoints);
  const v2 = normalizeTaskPoints(rawWork.variant2, input.maxPoints);
  const descriptors = rawWork.descriptors.map((d, idx) => ({
    ...d,
    taskNumber: v1[idx]?.number ?? d.taskNumber,
    points: v1[idx]?.points ?? d.points,
  }));

  return {
    ...rawWork,
    variant1: v1,
    variant2: v2,
    descriptors,
  };
}

const LEVEL_LABELS = {
  ru: {
    knowledge: "Знание и понимание",
    application: "Применение",
    higher_order: "Навыки высокого порядка",
  },
  kz: {
    knowledge: "Білу және түсіну",
    application: "Қолдану",
    higher_order: "Жоғары деңгей дағдылары",
  },
} as const;

/** Экспорт полного комплекта СОР/СОЧ (Вариант 1, Вариант 2, Дескрипторы + Ключи, Рубрика) в печатный Word (.docx). */
export async function buildSorSochDocx(work: SorSochWork): Promise<Buffer> {
  const isKz = work.language === "kz";
  const NAVY = "1E3A8A";
  const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "64748B" };
  const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
  const letters = isKz ? ["A", "B", "C", "D", "E", "F"] : ["А", "Б", "В", "Г", "Д", "Е"];

  const renderVariantBlock = (
    variantNum: 1 | 2,
    tasks: SorSochWork["variant1"],
    pageBreak: boolean,
  ): (Paragraph | Table)[] => {
    const out: (Paragraph | Table)[] = [];
    out.push(
      new Paragraph({
        pageBreakBefore: pageBreak,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: `${work.title} — ${isKz ? `${variantNum}-нұсқа` : `Вариант ${variantNum}`}`,
            bold: true,
            size: 28,
            color: NAVY,
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({
            text: isKz
              ? `Оқушының аты-жөні: ____________________________________   Сынып: ${work.grade} «___»   Күні: __________`
              : `ФИО обучающегося: ____________________________________   Класс: ${work.grade} «___»   Дата: __________`,
            bold: true,
            size: 21,
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: isKz
              ? `Орындау уақыты: ${work.durationMinutes} мин.   Ең жоғары балл: ${work.maxPoints}`
              : `Время выполнения: ${work.durationMinutes} мин.   Максимальный балл: ${work.maxPoints}`,
            size: 20,
            color: "475569",
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 160 },
        children: [
          new TextRun({
            text: `${isKz ? "Оқу мақсаттары: " : "Цели обучения: "}${work.learningObjectives.join("; ")}`,
            italics: true,
            size: 19,
            color: "334155",
          }),
        ],
      }),
    );

    tasks.forEach((t) => {
      out.push(
        new Paragraph({
          spacing: { before: 160, after: 80 },
          shading: { type: ShadingType.CLEAR, fill: "EFF6FF" },
          children: [
            new TextRun({
              text: isKz
                ? `${t.number}-тапсырма (${LEVEL_LABELS.kz[t.level]}) — [${t.points} балл]`
                : `Задание ${t.number} (${LEVEL_LABELS.ru[t.level]}) — [${t.points} б.]`,
              bold: true,
              size: 22,
              color: NAVY,
            }),
          ],
        }),
        new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun({ text: formatMathPlain(t.prompt), size: 22 })],
        }),
      );

      if (t.taskType === "mcq" && t.options && t.options.length > 0) {
        t.options.forEach((opt, idx) => {
          out.push(
            new Paragraph({
              spacing: { after: 50 },
              indent: { left: 240 },
              children: [
                new TextRun({
                  text: `☐ ${letters[idx] ?? idx + 1}) ${formatMathPlain(opt)}`,
                  size: 21,
                }),
              ],
            }),
          );
        });
      } else {
        const lineCount = t.taskType === "short" ? 2 : 4;
        for (let l = 0; l < lineCount; l++) {
          out.push(
            new Paragraph({
              spacing: { after: 140 },
              border: { bottom: { style: BorderStyle.DASHED, size: 4, color: "94A3B8", space: 2 } },
              children: [new TextRun({ text: " ", size: 20 })],
            }),
          );
        }
      }
    });

    return out;
  };

  // Сводная таблица дескрипторов и ключей ответов для учителя
  const descHeaders = isKz
    ? ["Критерий", "№", "Дескриптор (білім алушы)", "Балл", "Жауап (1-нұсқа / 2-нұсқа)"]
    : ["Критерий оценивания", "№", "Дескриптор (обучающийся)", "Балл", "Ключ (Вар. 1 / Вар. 2)"];

  const descTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: descHeaders.map((h, i) =>
          new TableCell({
            borders: BORDERS,
            width: { size: [24, 6, 36, 10, 24][i]!, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: NAVY },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: h, bold: true, size: 19, color: "FFFFFF" })],
              }),
            ],
          }),
        ),
      }),
      ...work.descriptors.map(
        (d) =>
          new TableRow({
            cantSplit: true,
            children: [
              new TableCell({
                borders: BORDERS,
                margins: { top: 80, bottom: 80, left: 100, right: 100 },
                children: [new Paragraph({ children: [new TextRun({ text: formatMathPlain(d.criterion), size: 19 })] })],
              }),
              new TableCell({
                borders: BORDERS,
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: String(d.taskNumber), bold: true, size: 19 })],
                  }),
                ],
              }),
              new TableCell({
                borders: BORDERS,
                margins: { top: 80, bottom: 80, left: 100, right: 100 },
                children: d.steps.map(
                  (st) =>
                    new Paragraph({
                      spacing: { after: 40 },
                      children: [new TextRun({ text: `• ${formatMathPlain(st)}`, size: 19 })],
                    }),
                ),
              }),
              new TableCell({
                borders: BORDERS,
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: String(d.points), bold: true, size: 19 })],
                  }),
                ],
              }),
              new TableCell({
                borders: BORDERS,
                margins: { top: 80, bottom: 80, left: 100, right: 100 },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ text: "I: ", bold: true, size: 18 }),
                      new TextRun({ text: formatMathPlain(d.answerVariant1), size: 18 }),
                    ],
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({ text: "II: ", bold: true, size: 18 }),
                      new TextRun({ text: formatMathPlain(d.answerVariant2), size: 18 }),
                    ],
                  }),
                ],
              }),
            ],
          }),
      ),
    ],
  });

  // Рубрика для родителей
  const rubHeaders = isKz
    ? ["Бағалау критерийі", "Төмен деңгей", "Орта деңгей", "Жоғары деңгей"]
    : ["Критерий оценивания", "Низкий уровень", "Средний уровень", "Высокий уровень"];

  const rubTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: rubHeaders.map((h) =>
          new TableCell({
            borders: BORDERS,
            width: { size: 25, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: "E2E8F0" },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: h, bold: true, size: 19, color: NAVY })],
              }),
            ],
          }),
        ),
      }),
      ...work.rubric.map(
        (r) =>
          new TableRow({
            cantSplit: true,
            children: [r.criterion, r.low, r.medium, r.high].map(
              (cellVal, idx) =>
                new TableCell({
                  borders: BORDERS,
                  margins: { top: 80, bottom: 80, left: 100, right: 100 },
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: formatMathPlain(cellVal),
                          bold: idx === 0,
                          size: 19,
                        }),
                      ],
                    }),
                  ],
                }),
            ),
          }),
      ),
    ],
  });

  const children: (Paragraph | Table)[] = [
    ...renderVariantBlock(1, work.variant1, false),
    ...renderVariantBlock(2, work.variant2, true),
    new Paragraph({
      pageBreakBefore: true,
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 140 },
      children: [
        new TextRun({
          text: isKz
            ? "Балл қою кестесі, дескрипторлар және жауап кілттері (мұғалімге арналған)"
            : "Таблица выставления баллов, дескрипторы и ключи ответов (для педагога)",
          bold: true,
          size: 26,
          color: NAVY,
        }),
      ],
    }),
    descTable,
    new Paragraph({
      spacing: { before: 280, after: 120 },
      heading: HeadingLevel.HEADING_2,
      children: [
        new TextRun({
          text: isKz
            ? "Ата-аналарға ақпарат беруге арналған рубрика"
            : "Рубрика для предоставления информации родителям по итогам суммативного оценивания",
          bold: true,
          size: 24,
          color: NAVY,
        }),
      ],
    }),
    rubTable,
  ];

  const doc = new Document({
    sections: [
      {
        properties: { page: { margin: { top: 720, bottom: 720, left: 800, right: 720 } } },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
