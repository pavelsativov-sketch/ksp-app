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
Сабақтың үш кезеңі арасында логикалық байланыс болуы тиіс: басы (актуализация → қызығушылықты ояту) → ортасы (теория → тәжірибе → бекіту) → аяғы (қорытынды → рефлексия → үй тапсырмасы).
Әр кезеңге: уақыт диапазоны ("1–10 мин"), мұғалімнің әрекеттері, оқушылардың әрекеттері, ресурстар. Қосымша: кумулятивтік әңгіме үшін кілт сұрақтары, бағалау дескрипторлары, бағалау әдісі (ҚБ/ЖБ/Өзара/Өзін-өзі бағалау).
Аяқтау кезеңіне: үй тапсырмасы, сабақ қорытындысы, рефлексия сұрақтары.
Жауапты қатаң JSON форматында қайтар.`;
  }
  return `Ты помощник для учителей Казахстана, который составляет КСП (краткосрочный план урока) по стандарту обновлённого содержания образования РК.
КЛЮЧЕВОЕ ТРЕБОВАНИЕ: между этапами должна быть ЯВНАЯ ЛОГИЧЕСКАЯ СВЯЗЬ.
- Начало: организационный момент → кумулятивная беседа (повторение пройденного через 2–3 ключевых вопроса) → формулировка темы и целей урока, ознакомление с критериями успеха.
- Середина: объяснение нового → практика (задания, парная/групповая работа) → каждый блок практики имеет короткие дескрипторы оценивания ("Записывает команду…", "Объясняет понятие…").
- Конец: итог урока (что узнали) → рефлексия (3 открытых вопроса ученикам) → домашнее задание → самооценивание.
Метод оценивания указывай для каждого этапа: «Похвала», «ФО», «СОР», «Взаимооценивание», «Самооценивание».
Время записывай как диапазон («0–10 мин», «11–35 мин», «36–45 мин»). Пиши конкретно, с привязкой к возрасту учеников и теме. Отвечай строго в JSON.`;
}

export function buildUserPrompt(input: GenerateKspInput): string {
  const lang = input.language === "kz" ? "қазақ тілінде" : "на русском языке";
  return `Составь КСП ${lang} для следующего урока:
- Класс: ${input.grade}
- Предмет: ${input.subject}
- Тема урока: ${input.topic}
${
  input.learningObjectives && input.learningObjectives.length > 0
    ? `- Цели обучения из учебной программы (привязка ОБЯЗАТЕЛЬНА):\n${input.learningObjectives.map((o) => `  • ${o}`).join("\n")}`
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
- stages.beginning / middle / end:
  • time («1–10 мин», «11–35 мин», «36–45 мин»)
  • teacherActions, studentActions, resources
  • keyQuestions (массив строк): для beginning — 2–3 вопроса для актуализации; для middle — 1–2 вопроса по новой теме; для end — 1–2 итоговых.
  • descriptors (массив строк): для каждого этапа 2–4 коротких дескриптора оценивания ("Записывает …", "Объясняет …", "Сравнивает …").
  • assessmentMethod: один из «Похвала», «ФО», «СОР», «Взаимооценивание», «Самооценивание».
- В stages.end ДОПОЛНИТЕЛЬНО:
  • summary (1–2 предложения — что узнали)
  • reflectionQuestions (3 открытых вопроса ученикам — «Что было легко? Что сложно? Что вам понравилось?»)
  • homework (1 предложение — конкретное задание).
- evaluation.formativeAssessment (методы и инструменты)
- evaluation.differentiation (как поддержать слабых и усложнить для сильных)
- evaluation.healthAndSafety (ТБ и здоровьесберегающие моменты, физкультминутка)
- evaluation.reflection (3 вопроса учителю для самоанализа после урока).

Логические переходы между этапами должны быть осмысленными — каждый следующий этап опирается на предыдущий.`;
}

function stageSchema(extra?: {
  homework?: boolean;
  summary?: boolean;
  reflectionQuestions?: boolean;
}) {
  const properties: Record<string, unknown> = {
    time: { type: "string" },
    teacherActions: { type: "string" },
    studentActions: { type: "string" },
    resources: { type: "string" },
    keyQuestions: { type: "array", items: { type: "string" } },
    descriptors: { type: "array", items: { type: "string" } },
    assessmentMethod: { type: "string" },
  };
  const required = [
    "time",
    "teacherActions",
    "studentActions",
    "resources",
    "keyQuestions",
    "descriptors",
    "assessmentMethod",
  ];
  if (extra?.homework) {
    properties.homework = { type: "string" };
    required.push("homework");
  }
  if (extra?.summary) {
    properties.summary = { type: "string" };
    required.push("summary");
  }
  if (extra?.reflectionQuestions) {
    properties.reflectionQuestions = {
      type: "array",
      items: { type: "string" },
    };
    required.push("reflectionQuestions");
  }
  return {
    type: "object" as const,
    additionalProperties: false,
    required,
    properties,
  };
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
          end: stageSchema({
            homework: true,
            summary: true,
            reflectionQuestions: true,
          }),
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

export type AiKspPayload = Omit<KspContent, "header" | "learningObjectives">;
