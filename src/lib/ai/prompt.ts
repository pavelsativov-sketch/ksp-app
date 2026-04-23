import type { KspContent } from "@/lib/types/ksp";

export interface GenerateKspInput {
  grade: number;
  subject: string;
  topic: string;
  learningObjectives?: string[];
  language: "ru" | "kz";
}

export function buildSystemPrompt(language: "ru" | "kz"): string {
  if (language === "kz") {
    return `Сен Қазақстан Республикасының жаңартылған білім мазмұны стандартына сәйкес қысқа мерзімді жоспарды (ҚМЖ) құрастыратын көмекшісің.
Мектептің ҚМЖ құрылымын нақты сақта: тақырып, оқу мақсаттары, сабақтың мақсаттары (SMART), бағалау критерийлері, тілдік мақсаттар, құндылықтар, пәнаралық байланыс, алдыңғы білім, сабақ барысы (басы/ортасы/аяғы), дифференциация, бағалау, денсаулық және ҚТ, рефлексия.
Жауапты қатаң JSON форматында қайтар.`;
  }
  return `Ты помощник для учителей Казахстана, который составляет КСП (краткосрочный план урока) по стандарту обновлённого содержания образования РК.
Строго соблюдай структуру КСП: тема, цели обучения, цели урока (SMART), критерии оценивания, языковые цели, ценности, межпредметные связи, предшествующие знания, ход урока (начало/середина/конец), дифференциация, формативное оценивание, здоровье и ТБ, рефлексия.
Пиши конкретно, с привязкой к возрасту учеников и теме. Время этапов указывай в минутах. Отвечай строго в JSON-формате.`;
}

export function buildUserPrompt(input: GenerateKspInput): string {
  const lang = input.language === "kz" ? "қазақ тілінде" : "на русском языке";
  return `Составь КСП ${lang} для следующего урока:
- Класс: ${input.grade}
- Предмет: ${input.subject}
- Тема урока: ${input.topic}
${
  input.learningObjectives && input.learningObjectives.length > 0
    ? `- Цели обучения из учебной программы:\n${input.learningObjectives.map((o) => `  • ${o}`).join("\n")}`
    : ""
}

Заполни ВСЕ поля структуры:
- lessonObjectives (3–5 SMART-целей урока)
- assessmentCriteria (3–5 измеримых критериев)
- languageObjectives.terms (5–10 предметных терминов)
- languageObjectives.phrases (3–5 ключевых фраз)
- values (1–2 предложения про воспитательную ценность)
- crossCurricularLinks (1–2 предложения)
- priorKnowledge (что ученики уже должны знать)
- stages.beginning / middle / end — каждый этап: time (напр. "0–5 мин"), teacherActions, studentActions, resources
- evaluation.formativeAssessment (методы и инструменты)
- evaluation.differentiation (как поддержать слабых и усложнить для сильных)
- evaluation.healthAndSafety (ТБ и здоровьесберегающие моменты)
- evaluation.reflection (3 вопроса учителю для самоанализа)`;
}

export const OPENAI_JSON_SCHEMA = {
  name: "ksp_content",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "topic",
      "lessonObjectives",
      "assessmentCriteria",
      "languageObjectives",
      "values",
      "crossCurricularLinks",
      "priorKnowledge",
      "stages",
      "evaluation",
    ],
    properties: {
      topic: { type: "string" },
      lessonObjectives: { type: "array", items: { type: "string" } },
      assessmentCriteria: { type: "array", items: { type: "string" } },
      languageObjectives: {
        type: "object",
        additionalProperties: false,
        required: ["terms", "phrases"],
        properties: {
          terms: { type: "array", items: { type: "string" } },
          phrases: { type: "array", items: { type: "string" } },
        },
      },
      values: { type: "string" },
      crossCurricularLinks: { type: "string" },
      priorKnowledge: { type: "string" },
      stages: {
        type: "object",
        additionalProperties: false,
        required: ["beginning", "middle", "end"],
        properties: {
          beginning: stageSchema(),
          middle: stageSchema(),
          end: stageSchema(),
        },
      },
      evaluation: {
        type: "object",
        additionalProperties: false,
        required: [
          "formativeAssessment",
          "differentiation",
          "healthAndSafety",
          "reflection",
        ],
        properties: {
          formativeAssessment: { type: "string" },
          differentiation: { type: "string" },
          healthAndSafety: { type: "string" },
          reflection: { type: "string" },
        },
      },
    },
  },
} as const;

function stageSchema() {
  return {
    type: "object" as const,
    additionalProperties: false,
    required: ["time", "teacherActions", "studentActions", "resources"],
    properties: {
      time: { type: "string" },
      teacherActions: { type: "string" },
      studentActions: { type: "string" },
      resources: { type: "string" },
    },
  };
}

export type AiKspPayload = Omit<KspContent, "header" | "learningObjectives">;
