import { OPENAI_JSON_SCHEMA, type AiKspPayload } from "./prompt";
import { completeJson, isAiConfigured } from "./client";

export { isAiConfigured };

interface ImportInput {
  rawText: string;
  /** UI language for the structured output. Defaults to ru. */
  language?: "ru" | "kz";
  /** Optional hints from the user. */
  hints?: {
    grade?: number;
    subject?: string;
  };
}

const SYSTEM_RU = [
  "Ты помощник учителя в Казахстане. Тебе передан полный текст уже",
  "написанного краткосрочного плана урока (КСП), извлечённый из .docx.",
  "Извлеки ВСЕ существующие данные и аккуратно разложи по полям JSON-схемы.",
  "",
  "ПРАВИЛА:",
  "• Ничего не выдумывай. Если поле не указано в исходнике — оставь пустым ('') или [].",
  "• Сохраняй формулировки автора как есть, не перефразируй.",
  "• Цели обучения с кодами (например, '7.1.2.1 — ...') попадают в",
  "  learningObjectives ИЛИ в начало lessonObjectives — на твоё усмотрение,",
  "  но не теряй их.",
  "• Этапы урока распознавай по словам «Начало», «Середина», «Конец»,",
  "  «Орг. момент», «Основная часть», «Рефлексия» и т.п.",
  "• Если в тексте есть таблица «1–10 баллов» — это overallRubric.",
  "• Если есть таблица «балл за что» — это pointsScale.",
  "• Если есть домашнее задание / итог / рефлексия — заполни соответствующие поля",
  "  в stages.end.",
  "• Дескрипторы и ключевые вопросы клади в descriptors / keyQuestions",
  "  каждого этапа, если они там были.",
  "",
  "Возвращай ТОЛЬКО JSON по схеме.",
].join("\n");

const SYSTEM_KZ = [
  "Сен Қазақстандағы мұғалімнің көмекшісісің. Саған бұрын жазылған",
  "қысқа мерзімді сабақ жоспарының (ҚМЖ) толық мәтіні берілген.",
  "Барлық деректерді шығарып, JSON-схемасының өрістеріне дұрыс орналастыр.",
  "",
  "ЕРЕЖЕЛЕР:",
  "• Ештеңе ойдан құрастырма. Өріс деректерде көрсетілмесе — бос ('') немесе [] қалдыр.",
  "• Авторлық тұжырымдарды өзгертпе.",
  "• Оқу мақсаттарының кодтары (мысалы, '7.1.2.1 — ...') learningObjectives-ке",
  "  немесе lessonObjectives басына түседі — таңдау сенікі, бірақ жоғалтпа.",
  "• Кезеңдерді «Басы», «Ортасы», «Соңы», «Ұйым. сәт», «Негізгі бөлім», «Рефлексия»",
  "  деген сөздер бойынша анықта.",
  "• «1–10 балл» кестесі болса — ол overallRubric.",
  "• «Не үшін балл» кестесі болса — ол pointsScale.",
  "",
  "Тек JSON қайтар.",
].join("\n");

/**
 * Heuristic stub used when no AI provider is configured — returns the raw
 * text as the topic and lessonObjectives so the user at least sees their
 * content in the form. Real parsing requires a provider.
 */
function stubImport(input: ImportInput): AiKspPayload {
  const lines = input.rawText
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    topic: lines[0] ?? "Импортированный план",
    lessonObjectives: lines.slice(1, 4),
    assessmentCriteria: [],
    languageObjectives: { terms: [], phrases: [] },
    values: "",
    crossCurricularLinks: "",
    priorKnowledge: "",
    stages: {
      beginning: emptyStage(),
      middle: emptyStage(),
      end: emptyStage(),
    },
    evaluation: {
      formativeAssessment: "",
      differentiation: "",
      healthAndSafety: "",
      reflection: "",
    },
  };
}

function emptyStage() {
  return {
    time: "",
    teacherActions: "",
    studentActions: "",
    resources: "",
  };
}

export async function importKspFromText(
  input: ImportInput,
): Promise<AiKspPayload> {
  if (!input.rawText.trim()) {
    throw new Error("Файл пустой — текст не извлечён.");
  }
  if (!isAiConfigured()) return stubImport(input);

  const language = input.language ?? "ru";
  const userPrompt = [
    "Исходный текст КСП (как извлечён из .docx, переносы и таблицы могут быть",
    "плоскими — ориентируйся на ключевые слова заголовков):",
    "===",
    input.rawText.slice(0, 30_000),
    "===",
    input.hints?.subject ? `Подсказка — предмет: ${input.hints.subject}` : "",
    input.hints?.grade ? `Подсказка — класс: ${input.hints.grade}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return completeJson<AiKspPayload>({
    system: language === "kz" ? SYSTEM_KZ : SYSTEM_RU,
    user: userPrompt,
    schema: OPENAI_JSON_SCHEMA.schema,
    schemaName: OPENAI_JSON_SCHEMA.name,
    temperature: 0.2,
    timeoutMs: 90_000,
    maxRetries: 1,
  });
}
