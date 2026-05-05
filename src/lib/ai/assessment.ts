/**
 * AI generation of СОР / СОЧ (summative assessment papers).
 *
 * The generated content shape mirrors `AssessmentContent` exactly so the
 * resulting object can be stored in `assessment_papers.content` after a
 * single zod parse.
 */
import { completeJson } from "./client";
import type {
  AssessmentContent,
  AssessmentKind,
} from "@/lib/types/assessment";

const SCHEMA = {
  type: "object",
  required: [
    "header",
    "sections",
    "durationMinutes",
    "learningObjectives",
    "criteria",
    "tasks",
    "gradeBoundaries",
    "instructions",
  ],
  properties: {
    header: {
      type: "object",
      properties: {
        school: { type: "string" },
        teacherName: { type: "string" },
        date: { type: "string" },
        grade: { type: "string" },
      },
    },
    sections: { type: "array", items: { type: "string" } },
    durationMinutes: { type: "integer" },
    learningObjectives: {
      type: "array",
      items: {
        type: "object",
        required: ["code", "text"],
        properties: { code: { type: "string" }, text: { type: "string" } },
      },
    },
    criteria: {
      type: "array",
      items: {
        type: "object",
        required: ["code", "descriptor", "taskNumbers"],
        properties: {
          code: { type: "string" },
          descriptor: { type: "string" },
          taskNumbers: { type: "array", items: { type: "integer" } },
        },
      },
    },
    tasks: {
      type: "array",
      items: {
        type: "object",
        required: [
          "number",
          "learningObjectiveCode",
          "type",
          "text",
          "answerKey",
          "points",
          "descriptors",
        ],
        properties: {
          number: { type: "integer" },
          learningObjectiveCode: { type: "string" },
          type: {
            type: "string",
            enum: ["open", "test", "match", "fill", "essay"],
          },
          text: { type: "string" },
          answerKey: { type: "string" },
          points: { type: "integer" },
          descriptors: { type: "array", items: { type: "string" } },
        },
      },
    },
    gradeBoundaries: {
      type: "array",
      items: {
        type: "object",
        required: ["grade", "minPoints", "maxPoints"],
        properties: {
          grade: { type: "integer" },
          minPoints: { type: "integer" },
          maxPoints: { type: "integer" },
        },
      },
    },
    instructions: { type: "string" },
  },
};

const SYSTEM_RU = `Ты — методист, составляющий суммативное оценивание для казахстанской школы.

Что такое СОР: суммативное оценивание за раздел (40 минут, проверяет 1 раздел).
Что такое СОЧ: суммативное оценивание за четверть (40–80 минут, охватывает все разделы четверти).

Правила:
1. Задания связаны с целями обучения по коду (learningObjectiveCode совпадает с одним из learningObjectives.code).
2. Используй разные типы заданий: open (развёрнутый), test (один правильный вариант), match (соответствие), fill (пропуски), essay (эссе).
3. Каждое задание содержит дескрипторы оценивания — что именно надо сделать, чтобы получить N баллов.
4. answerKey — эталонный ответ, который видит только учитель. Для тестов укажи букву правильного варианта + объяснение.
5. Баллы заданий должны давать в сумме разумное количество (для СОР обычно 10–15 баллов, для СОЧ — 20–30).
6. Шкала перевода в 5-балльную оценку (gradeBoundaries) должна покрыть весь диапазон 0..maxTotal без пропусков.
   Пример при maxTotal=15:
     5 → 13..15, 4 → 10..12, 3 → 7..9, 2 → 4..6, 1 → 0..3.
7. Критерии оценивания (criteria) — короткие формулировки + ссылки на номера заданий, которые их проверяют.
8. instructions — краткая инструкция ученику (1–3 предложения): сколько времени, как оформлять, нужна ли таблица для ответов.
9. Никаких комментариев / пояснений в ответе вне JSON.`;

const SYSTEM_KZ = `Сен — Қазақстан мектебіне арналған жиынтық бағалау құрастыратын әдіскерсің.

БЖБ: бөлім бойынша жиынтық бағалау (40 минут, 1 бөлімді тексереді).
ТЖБ: тоқсан бойынша жиынтық бағалау (40–80 минут, тоқсанның барлық бөлімдерін қамтиды).

Ережелер:
1. Тапсырмалар оқу мақсаттарына код арқылы байланысты (learningObjectiveCode learningObjectives.code-пен сәйкес келеді).
2. Тапсырманың әртүрлі түрлерін қолдан: open, test, match, fill, essay.
3. Әр тапсырмада дескрипторлар бар — N балл алу үшін не істеу керек.
4. answerKey — мұғалімге ғана көрінетін эталон жауап.
5. Баллдардың жиыны БЖБ үшін 10–15, ТЖБ үшін 20–30 шамасында болсын.
6. gradeBoundaries 5-балдық шкаламен 0..maxTotal-ды толық қамтуы керек.
7. instructions — оқушыға қысқа нұсқаулық (1–3 сөйлем).`;

export interface GenerateAssessmentInput {
  kind: AssessmentKind;
  grade: number;
  /** Subject name (human-readable, e.g. "Математика"). */
  subject: string;
  /**
   * For СОР — the single section being tested (e.g. "Алгебра. Уравнения").
   * For СОЧ — comma-separated list of all sections covered in the quarter.
   */
  sections: string;
  quarter?: number | null;
  durationMinutes?: number | null;
  /** Codes from ГОСО (curriculum). The AI will produce tasks for each. */
  learningObjectives: { code: string; text: string }[];
  language: "ru" | "kz";
}

export async function generateAssessment(
  input: GenerateAssessmentInput,
): Promise<AssessmentContent> {
  const ru = input.language !== "kz";
  const kindLabel = ru
    ? input.kind === "sor"
      ? "СОР (суммативное оценивание за раздел)"
      : "СОЧ (суммативное оценивание за четверть)"
    : input.kind === "sor"
      ? "БЖБ (бөлім бойынша жиынтық бағалау)"
      : "ТЖБ (тоқсан бойынша жиынтық бағалау)";

  const objectivesText =
    input.learningObjectives
      .map((o) => `${o.code} — ${o.text}`)
      .join("\n") || "(не указаны — выбери самостоятельно по программе)";

  const userPrompt = ru
    ? `Сгенерируй ${kindLabel} для ${input.grade} класса по предмету "${input.subject}".

Раздел(ы): ${input.sections || "(укажи самостоятельно)"}
Четверть: ${input.quarter ?? "(не указана)"}
Длительность: ${input.durationMinutes ?? 40} минут

Проверяемые цели обучения:
${objectivesText}

Составь полную работу: 5–8 заданий разных типов, дескрипторы, ключи, шкала перевода в 5-балльную оценку, инструкция ученику.
Ответ — строго JSON по схеме.`
    : `${kindLabel} құрастыр. ${input.grade}-сынып, "${input.subject}" пәні.

Бөлім(дер): ${input.sections || "(өзің таңда)"}
Тоқсан: ${input.quarter ?? "(көрсетілмеген)"}
Ұзақтығы: ${input.durationMinutes ?? 40} минут

Тексерілетін мақсаттар:
${objectivesText}

5–8 түрлі тапсырма, дескрипторлар, кілттер, 5-балдық шкала, нұсқаулық. Тек JSON.`;

  const result = await completeJson<AssessmentContent>({
    system: ru ? SYSTEM_RU : SYSTEM_KZ,
    user: userPrompt,
    schema: SCHEMA,
    schemaName: "AssessmentContent",
    temperature: 0.7,
    timeoutMs: 90_000,
    maxRetries: 1,
  });

  // Light normalisation — make sure tasks are 1..N consecutive and points are
  // integers. Zod will catch hard violations downstream; this is just to keep
  // the UI from showing weird stuff if Gemini drifts.
  return {
    header: result.header ?? {
      school: "",
      teacherName: "",
      date: "",
      grade: String(input.grade),
    },
    sections: result.sections ?? [],
    durationMinutes: result.durationMinutes ?? input.durationMinutes ?? 40,
    learningObjectives: result.learningObjectives ?? [],
    criteria: result.criteria ?? [],
    tasks: (result.tasks ?? []).map((t, i) => ({
      ...t,
      number: i + 1,
      points: Math.max(0, Math.round(t.points || 0)),
      descriptors: t.descriptors ?? [],
      answerKey: t.answerKey ?? "",
    })),
    gradeBoundaries: result.gradeBoundaries ?? [],
    instructions: result.instructions ?? "",
  };
}
