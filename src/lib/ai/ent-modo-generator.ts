import "server-only";
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
import {
  entModoWorkSchema,
  type EntModoWork,
  type ExamKind,
  type MultiChoiceItem,
  type SingleChoiceItem,
} from "./ent-modo-models";

export interface GenerateEntModoInput {
  examKind: ExamKind;
  subject: string;
  grade: number;
  language: "ru" | "kz";
  partACount: number;
  contextCount: number;
  partCCount: number;
  learningObjectives: string[];
  topicFocus?: string;
}

function coerceOptions(raw: unknown, targetLen: number): string[] {
  const arr = Array.isArray(raw)
    ? raw.map((x) => String(x ?? "").trim()).filter(Boolean)
    : [];
  while (arr.length < targetLen) {
    arr.push(`Вариант ${arr.length + 1}`);
  }
  return arr.slice(0, targetLen);
}

function normalizeWork(raw: Record<string, unknown>, input: GenerateEntModoInput): EntModoWork {
  const isEnt = input.examKind === "ent_11";
  let cursor = 1;

  const rawA = Array.isArray(raw.partA) ? (raw.partA as Array<Record<string, unknown>>) : [];
  const partA: SingleChoiceItem[] = rawA.slice(0, input.partACount).map((item) => {
    const idx = Number(item.correctIndex ?? 0);
    return {
      number: cursor++,
      objectiveCode: String(item.objectiveCode ?? "").trim().slice(0, 80),
      prompt: String(item.prompt ?? item.question ?? "Вопрос").trim().slice(0, 2000),
      options: coerceOptions(item.options, 4),
      correctIndex: Number.isInteger(idx) && idx >= 0 && idx <= 3 ? idx : 0,
      points: 1,
      explanation: String(item.explanation ?? "").trim().slice(0, 1000),
    };
  });

  const rawCtx =
    raw.contextBlock && typeof raw.contextBlock === "object"
      ? (raw.contextBlock as Record<string, unknown>)
      : {};
  const rawCtxQuestions = Array.isArray(rawCtx.questions)
    ? (rawCtx.questions as Array<Record<string, unknown>>)
    : [];
  const ctxQuestions: SingleChoiceItem[] = rawCtxQuestions
    .slice(0, input.contextCount)
    .map((item) => {
      const idx = Number(item.correctIndex ?? 0);
      return {
        number: cursor++,
        objectiveCode: String(item.objectiveCode ?? "").trim().slice(0, 80),
        prompt: String(item.prompt ?? item.question ?? "Вопрос по тексту").trim().slice(0, 2000),
        options: coerceOptions(item.options, 4),
        correctIndex: Number.isInteger(idx) && idx >= 0 && idx <= 3 ? idx : 0,
        points: 1,
        explanation: String(item.explanation ?? "").trim().slice(0, 1000),
      };
    });

  const rawC =
    isEnt && Array.isArray(raw.partC) ? (raw.partC as Array<Record<string, unknown>>) : [];
  const partC: MultiChoiceItem[] = rawC.slice(0, input.partCCount).map((item) => {
    const indicesRaw = Array.isArray(item.correctIndices)
      ? item.correctIndices.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 5)
      : [0, 1];
    const unique = Array.from(new Set(indicesRaw)).slice(0, 3);
    if (unique.length === 0) unique.push(0);
    return {
      number: cursor++,
      objectiveCode: String(item.objectiveCode ?? "").trim().slice(0, 80),
      prompt: String(item.prompt ?? item.question ?? "Выберите верные утверждения").trim().slice(0, 2000),
      options: coerceOptions(item.options, 6),
      correctIndices: unique.sort((a, b) => a - b),
      points: 2,
      explanation: String(item.explanation ?? "").trim().slice(0, 1000),
    };
  });

  const maxPoints = partA.length + ctxQuestions.length + partC.length * 2;
  const defaultTitle =
    input.language === "kz"
      ? `${isEnt ? "ҰБТ" : "ББЖМ"} жаттықтырушы нұсқасы: ${input.subject} (${input.grade}-сынып)`
      : `Тренировочный вариант ${isEnt ? "ЕНТ" : "МОДО"}: ${input.subject} (${input.grade} класс)`;

  return entModoWorkSchema.parse({
    title: String(raw.title ?? defaultTitle).trim().slice(0, 240) || defaultTitle,
    examKind: input.examKind,
    subject: input.subject,
    grade: input.grade,
    language: input.language,
    durationMinutes: isEnt ? 60 : 40,
    maxPoints,
    partA,
    contextBlock: {
      title:
        String(rawCtx.title ?? (input.language === "kz" ? "Мәтінмен жұмыс" : "Контекстное задание"))
          .trim()
          .slice(0, 240) || "Контекст",
      passage:
        String(rawCtx.passage ?? "").trim().slice(0, 4000) ||
        "Прочитайте приведённый материал и выполните задания.",
      questions: ctxQuestions,
    },
    partC,
  });
}

export async function generateEntModoWork(input: GenerateEntModoInput): Promise<EntModoWork> {
  const isKz = input.language === "kz";
  const isEnt = input.examKind === "ent_11";
  const examName =
    input.examKind === "modo_4"
      ? isKz
        ? "ББЖМ (МОДО) — 4-сынып"
        : "МОДО — 4 класс"
      : input.examKind === "modo_9"
        ? isKz
          ? "ББЖМ (МОДО) — 9-сынып"
          : "МОДО — 9 класс"
        : isKz
          ? "ҰБТ (ЕНТ) — 10–11 сынып (ҰТО форматы)"
          : "ЕНТ — 10–11 класс (формат НЦТ РК)";

  const objectivesText =
    input.learningObjectives.length > 0
      ? input.learningObjectives.join("\n- ")
      : `${input.subject} (${input.grade} класс по ГОСО РК)`;

  const systemPrompt = `Ты — старший эксперт Национального центра тестирования (НЦТ / ҰТО МНВО и МП РК), разработчик контрольно-измерительных материалов ЕНТ и МОДО (ББЖМ).
Отвечай СТРОГО валидным JSON без обёрток и комментариев. Для формул используй запись $...$. Все дистракторы должны быть правдоподобными (типичные ошибки учащихся), а объяснения (explanation) — точными и обучающими.`;

  const partCPrompt = isEnt && input.partCCount > 0
    ? `3. Блок "partC" — ровно ${input.partCCount} заданий множественного выбора формата НЦТ РК (6 вариантов ответа options[0..5], в поле correctIndices массив из 1, 2 или 3 индексов от 0 до 5; 2 балла за задание).`
    : `3. Блок "partC" — верни пустой массив [] (в МОДО используются только задания с выбором 1 ответа из 4 и контекстные задания).`;

  const userPrompt = `Составь полноценный тренировочный вариант «${examName}» ${isKz ? "на казахском языке (Қазақ тілінде)" : "на русском языке"}:
- Направление / предмет: ${input.subject}
- Класс: ${input.grade}
${input.topicFocus ? `- Приоритетные темы / разделы: ${input.topicFocus}` : ""}
- Цели обучения ГОСО РК:
- ${objectivesText}

Структура варианта:
1. Блок "partA" — ровно ${input.partACount} тестовых заданий с выбором ОДНОГО правильного ответа из 4 (options из 4 строк, correctIndex от 0 до 3, objectiveCode — реальный код ГОСО вида "${input.grade}.x.x.x", explanation — краткий разбор правильного ответа).
2. Блок "contextBlock" — содержательный научно-популярный, исторический, прикладной или таблично-текстовый контекст (title + passage объёмом 120–220 слов с конкретными данными/числами/фактами) и ровно ${input.contextCount} вопросов к нему в массиве questions (по 4 варианта ответа, correctIndex 0..3, objectiveCode, explanation).
${partCPrompt}

Верни строго JSON структуры:
{
  "title": "...",
  "partA": [
    { "objectiveCode": "${input.grade}.1.1.1", "prompt": "...", "options": ["...", "...", "...", "..."], "correctIndex": 0, "explanation": "..." }
  ],
  "contextBlock": {
    "title": "...",
    "passage": "...",
    "questions": [
      { "objectiveCode": "${input.grade}.1.2.1", "prompt": "...", "options": ["...", "...", "...", "..."], "correctIndex": 2, "explanation": "..." }
    ]
  },
  "partC": ${isEnt && input.partCCount > 0 ? `[ { "objectiveCode": "${input.grade}.2.1.1", "prompt": "...", "options": ["...", "...", "...", "...", "...", "..."], "correctIndices": [0, 3], "explanation": "..." } ]` : `[]`}
}`;

  const raw = await executeWithFallback(
    "generation",
    async (client, model, config, signal) => {
      const resp = await client.chat.completions.create(
        {
          model,
          temperature: 0.4,
          max_completion_tokens: config.maxTokens ?? 8192,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        },
        { signal },
      );
      const text = resp.choices[0]?.message?.content?.trim();
      if (!text) throw new Error("Пустой ответ ИИ");
      return extractJson<Record<string, unknown>>(text);
    },
    { budgetMs: 90_000, timeoutMs: 55_000 },
  );

  return normalizeWork(raw, input);
}

const LETTERS_4 = ["A", "B", "C", "D"];
const LETTERS_6 = ["A", "B", "C", "D", "E", "F"];

export async function buildEntModoDocx(work: EntModoWork): Promise<Buffer> {
  const isKz = work.language === "kz";
  const children: Array<Paragraph | Table> = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 120 },
      children: [new TextRun({ text: formatMathPlain(work.title), bold: true, size: 28 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: isKz
            ? `Пән: ${work.subject}  |  Сынып: ${work.grade}  |  Уақыты: ${work.durationMinutes} мин  |  Ең жоғары балл: ${work.maxPoints}`
            : `Направление: ${work.subject}  |  Класс: ${work.grade}  |  Время: ${work.durationMinutes} мин  |  Макс. балл: ${work.maxPoints}`,
          size: 21,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: isKz
            ? "Оқушының аты-жөні: __________________________________________   Сыныбы: ________"
            : "ФИО учащегося: ______________________________________________   Класс: _________",
          size: 22,
        }),
      ],
    }),
  );

  // Часть А
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 160, after: 120 },
      children: [
        new TextRun({
          text: isKz
            ? "А бөлімі. Бір дұрыс жауабы бар тапсырмалар (1 балл)"
            : "Часть А. Задания с выбором одного правильного ответа (по 1 баллу)",
          bold: true,
          size: 24,
        }),
      ],
    }),
  );

  for (const q of work.partA) {
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 60 },
        children: [
          new TextRun({ text: `${q.number}. `, bold: true, size: 22 }),
          new TextRun({ text: formatMathPlain(q.prompt), size: 22 }),
          ...(q.objectiveCode
            ? [new TextRun({ text: `  [${q.objectiveCode}]`, italics: true, size: 18, color: "555555" })]
            : []),
        ],
      }),
    );
    q.options.forEach((opt, idx) => {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { after: 30 },
          children: [
            new TextRun({ text: `${LETTERS_4[idx]}) `, bold: true, size: 21 }),
            new TextRun({ text: formatMathPlain(opt), size: 21 }),
          ],
        }),
      );
    });
  }

  // Часть Б — Контекст
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({
          text: isKz
            ? `В бөлімі. Контекстік тапсырма: «${formatMathPlain(work.contextBlock.title)}»`
            : `Часть Б. Контекстное задание: «${formatMathPlain(work.contextBlock.title)}»`,
          bold: true,
          size: 24,
        }),
      ],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { type: ShadingType.CLEAR, color: "auto", fill: "F4F6FA" },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
                left: { style: BorderStyle.SINGLE, size: 8, color: "4F46E5" },
                right: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
              },
              children: work.contextBlock.passage
                .split(/\n+/)
                .filter(Boolean)
                .map(
                  (line) =>
                    new Paragraph({
                      spacing: { before: 60, after: 60 },
                      children: [new TextRun({ text: formatMathPlain(line), size: 21 })],
                    }),
                ),
            }),
          ],
        }),
      ],
    }),
  );

  for (const q of work.contextBlock.questions) {
    children.push(
      new Paragraph({
        spacing: { before: 140, after: 60 },
        children: [
          new TextRun({ text: `${q.number}. `, bold: true, size: 22 }),
          new TextRun({ text: formatMathPlain(q.prompt), size: 22 }),
        ],
      }),
    );
    q.options.forEach((opt, idx) => {
      children.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { after: 30 },
          children: [
            new TextRun({ text: `${LETTERS_4[idx]}) `, bold: true, size: 21 }),
            new TextRun({ text: formatMathPlain(opt), size: 21 }),
          ],
        }),
      );
    });
  }

  // Часть В — Множественный выбор (для ЕНТ)
  if (work.partC.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 120 },
        children: [
          new TextRun({
            text: isKz
              ? "С бөлімі. Бір немесе бірнеше дұрыс жауабы бар тапсырмалар (1–3 жауап, 2 балл)"
              : "Часть В. Задания с выбором одного или нескольких правильных ответов (1–3 ответа из 6, по 2 балла)",
            bold: true,
            size: 24,
          }),
        ],
      }),
    );

    for (const q of work.partC) {
      children.push(
        new Paragraph({
          spacing: { before: 120, after: 60 },
          children: [
            new TextRun({ text: `${q.number}. `, bold: true, size: 22 }),
            new TextRun({ text: formatMathPlain(q.prompt), size: 22 }),
          ],
        }),
      );
      q.options.forEach((opt, idx) => {
        children.push(
          new Paragraph({
            indent: { left: 360 },
            spacing: { after: 30 },
            children: [
              new TextRun({ text: `${LETTERS_6[idx]}) `, bold: true, size: 21 }),
              new TextRun({ text: formatMathPlain(opt), size: 21 }),
            ],
          }),
        );
      });
    }
  }

  // Лист ключей и спецификация ГОСО для учителя
  children.push(
    new Paragraph({
      pageBreakBefore: true,
      heading: HeadingLevel.HEADING_2,
      spacing: { after: 140 },
      children: [
        new TextRun({
          text: isKz
            ? "Мұғалімге арналған жауап кілттері мен МЖМБС спецификациясы"
            : "Ключи ответов, разбор и спецификация по целям ГОСО (для учителя)",
          bold: true,
          size: 26,
        }),
      ],
    }),
  );

  const specRows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        isKz ? "№" : "№",
        isKz ? "МЖМБС коды" : "Код ГОСО",
        isKz ? "Дұрыс жауап" : "Ключ",
        isKz ? "Балл" : "Балл",
        isKz ? "Түсіндірме" : "Пояснение / разбор",
      ].map(
        (h) =>
          new TableCell({
            shading: { type: ShadingType.CLEAR, color: "auto", fill: "EEF2FF" },
            children: [
              new Paragraph({
                children: [new TextRun({ text: h, bold: true, size: 20 })],
              }),
            ],
          }),
      ),
    }),
  ];

  const pushKeyRow = (num: number, code: string, key: string, pts: number, expl: string) => {
    specRows.push(
      new TableRow({
        children: [String(num), code || "—", key, String(pts), formatMathPlain(expl || "—")].map(
          (val) =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: val, size: 19 })] })],
            }),
        ),
      }),
    );
  };

  for (const q of work.partA) {
    pushKeyRow(q.number, q.objectiveCode, LETTERS_4[q.correctIndex] ?? "A", 1, q.explanation);
  }
  for (const q of work.contextBlock.questions) {
    pushKeyRow(q.number, q.objectiveCode, LETTERS_4[q.correctIndex] ?? "A", 1, q.explanation);
  }
  for (const q of work.partC) {
    const key = q.correctIndices.map((i) => LETTERS_6[i] ?? "A").join(", ");
    pushKeyRow(q.number, q.objectiveCode, key, 2, q.explanation);
  }

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: specRows,
    }),
  );

  const doc = new Document({
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
