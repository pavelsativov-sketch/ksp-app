import { executeWithFallback, isAnyProviderConfigured } from "./providers";

export type TopSection =
  | "lessonObjectives"
  | "assessmentCriteria"
  | "languageObjectivesTerms"
  | "languageObjectivesPhrases"
  | "glossary"
  | "values"
  | "priorKnowledge"
  | "crossCurricularLinks"
  | "formativeAssessment"
  | "differentiation"
  | "healthAndSafety"
  | "reflection";

export type StageSection =
  | "teacherActions"
  | "studentActions"
  | "resources"
  | "keyQuestions"
  | "descriptors"
  | "reflectionQuestions"
  | "homework"
  | "summary";

export type Section = TopSection | StageSection;
export type Stage = "beginning" | "middle" | "end";

export const TOP_LEVEL_SECTIONS: readonly TopSection[] = [
  "lessonObjectives",
  "assessmentCriteria",
  "languageObjectivesTerms",
  "languageObjectivesPhrases",
  "glossary",
  "values",
  "priorKnowledge",
  "crossCurricularLinks",
  "formativeAssessment",
  "differentiation",
  "healthAndSafety",
  "reflection",
];

export const STAGE_SECTIONS: readonly StageSection[] = [
  "teacherActions",
  "studentActions",
  "resources",
  "keyQuestions",
  "descriptors",
  "reflectionQuestions",
  "homework",
  "summary",
];

export const SECTION_LABEL: Record<Section, string> = {
  lessonObjectives: "Цели урока (SMART)",
  assessmentCriteria: "Критерии оценивания",
  languageObjectivesTerms: "Языковые цели — термины",
  languageObjectivesPhrases: "Языковые цели — ключевые фразы",
  glossary: "Глоссарий RU–KK",
  values: "Привитие ценностей",
  priorKnowledge: "Предшествующие знания",
  crossCurricularLinks: "Межпредметные связи",
  formativeAssessment: "Формативное оценивание",
  differentiation: "Дифференциация",
  healthAndSafety: "Здоровье и ТБ",
  reflection: "Рефлексия учителя",
  teacherActions: "Действия учителя",
  studentActions: "Действия учеников",
  resources: "Ресурсы",
  keyQuestions: "Ключевые вопросы",
  descriptors: "Дескрипторы оценивания",
  reflectionQuestions: "Рефлексивные вопросы ученикам",
  homework: "Домашнее задание",
  summary: "Итог урока",
};

export const STAGE_LABEL: Record<Stage, string> = {
  beginning: "Начало урока (1–10 мин, актуализация, кумулятивная беседа)",
  middle: "Середина урока (11–35 мин, объяснение и практика)",
  end: "Конец урока (36–45 мин, итог, рефлексия, домашка)",
};

export interface EnhanceSectionInput {
  section: string;
  stage?: "beginning" | "middle" | "end";
  current: string | string[];
  context: {
    topic?: string;
    subject?: string;
    grade?: number;
    language?: "ru" | "kz";
  };
}

export interface EnhanceSectionResult {
  improved: string | string[];
  isList: boolean;
  stub: boolean;
  note?: string;
}

export async function enhanceSection(input: EnhanceSectionInput): Promise<EnhanceSectionResult> {
  const { section, stage, current, context } = input;
  const isStageSection = (STAGE_SECTIONS as readonly string[]).includes(section as StageSection);
  if (isStageSection && !stage) {
    throw new Error("stage is required for stage-level sections");
  }
  const isList = Array.isArray(current);

  if (!isAnyProviderConfigured()) {
    return {
      improved: fallbackImprove(section as Section, stage, current, context),
      isList,
      stub: true,
      note: "Демо-режим: добавьте ключ для реальной AI-обработки.",
    };
  }

  const improved = await callAi(section as Section, stage, current, context);
  return { improved, isList, stub: false };
}

function buildPrompt(
  section: Section,
  stage: Stage | undefined,
  current: string | string[],
  ctx: { topic?: string; subject?: string; grade?: number; language?: "ru" | "kz" },
): { system: string; user: string; expectsList: boolean } {
  const expectsList = Array.isArray(current);
  const lang = ctx.language === "kz" ? "казахский" : "русский";
  const sectionTitle = SECTION_LABEL[section] ?? section;
  const stageHint = stage ? `\nЭтап урока: ${STAGE_LABEL[stage]}` : "";

  const guidance = sectionGuidance(section, stage);

  const system =
    `Ты опытный методист РК, помогающий учителю казахстанской школы по обновлённому содержанию (ГОСО). ` +
    `Твоя задача — улучшить ТОЛЬКО запрошенный фрагмент КСП. Сохраняй уже хорошее, дополняй и переписывай только слабое. ` +
    `Формулировки должны быть конкретные, измеримые, с привязкой к теме урока, возрасту учеников и этапу. ` +
    `Без markdown, без префиксов «- » или «1)», без вступлений и пояснений. ` +
    `Отвечай ${expectsList ? "JSON-объектом {\"items\": [\"…\", \"…\"]} (массив строк)" : "одной строкой обычного текста"}.`;

  const user = `Раздел КСП: ${sectionTitle}${stageHint}
Предмет: ${ctx.subject || "—"}
Класс: ${ctx.grade ?? "—"}
Тема урока: ${ctx.topic || "—"}
Язык ответа: ${lang}

${guidance}

Текущее содержание:
${
  Array.isArray(current)
    ? current.length === 0
      ? "(пусто)"
      : current.map((x, i) => `${i + 1}. ${x}`).join("\n")
    : current || "(пусто)"
}

Верни улучшенную версию ${expectsList ? "в формате {\"items\": [\"…\"]}" : "одной строкой"}.`;

  return { system, user, expectsList };
}

function sectionGuidance(section: Section, stage?: Stage): string {
  switch (section) {
    case "lessonObjectives":
      return "Сделай 3–5 SMART-целей: Specific, Measurable, Achievable, Relevant, Time-bound. Каждая начинается с «Учащиеся смогут …» и опирается на ключевое понятие темы.";
    case "assessmentCriteria":
      return "3–5 проверяемых критериев. Каждый — наблюдаемое действие («Объясняет …», «Решает …», «Сравнивает …»).";
    case "languageObjectivesTerms":
      return "5–10 предметных терминов, релевантных именно этой теме. Без общих слов («тема», «урок»).";
    case "languageObjectivesPhrases":
      return "3–5 академических фраз, которые ученики смогут использовать в обсуждении («Я считаю, что …, потому что …»).";
    case "glossary":
      return "5–12 пар строго по теме урока в формате «термин на русском — термин на казахском» (напр. «числитель — алым»). Только предметная терминология, без общих слов. Каждую пару — отдельной строкой, без нумерации.";
    case "values":
      return "1–2 предложения. Конкретное воспитательное содержание (академическая честность, уважение, сотрудничество).";
    case "priorKnowledge":
      return "Что ученики ДОЛЖНЫ уже знать перед этим уроком (понятия, навыки из предыдущих тем).";
    case "crossCurricularLinks":
      return "1–2 предложения. Связь с другими предметами + где этот материал применяется в жизни.";
    case "formativeAssessment":
      return "Конкретные приёмы ФО: «Светофор», «Две звезды и пожелание», устная обратная связь, мини-тест и т.д.";
    case "differentiation":
      return "Чётко разделить: для МЕНЕЕ способных (карточки-опоры, работа в паре) и БОЛЕЕ способных (исследовательский вопрос, кейс).";
    case "healthAndSafety":
      return "Физкультминутка, осанка, освещение, ТБ при работе с конкретными ресурсами/инструментами темы.";
    case "reflection":
      return "3 вопроса учителю для самоанализа: достигнуты ли цели, что сработало, что изменить.";
    case "teacherActions":
      return stageGuidance(stage, "учителя");
    case "studentActions":
      return stageGuidance(stage, "учеников");
    case "resources":
      return "Перечисли конкретные ресурсы: учебник §X, презентация, раздаточные карточки 3 уровней, интерактивная доска.";
    case "keyQuestions":
      return stage === "beginning"
        ? "2–3 открытых вопроса для актуализации опорных знаний и связки с предыдущим уроком."
        : stage === "end"
          ? "1–2 итоговых вопроса, проверяющих усвоение ключевой идеи урока."
          : "1–2 наводящих вопроса по новому материалу, провоцирующих осмысление.";
    case "descriptors":
      return "2–4 коротких дескриптора оценивания. Глагол + объект: «Записывает определение», «Объясняет правило», «Сравнивает 2 примера».";
    case "reflectionQuestions":
      return "3 открытых вопроса ученикам в стиле «Что было легко? Что сложно? Что вам понравилось?». Подходят к теме урока.";
    case "homework":
      return "Конкретное задание с привязкой к материалу урока: параграф/упражнения, мини-исследование. Без воды.";
    case "summary":
      return "1–2 предложения: что узнали, что закрепили. Опирается на ключевое понятие темы.";
    default:
      return "";
  }
}

function stageGuidance(stage: Stage | undefined, who: "учителя" | "учеников"): string {
  if (stage === "beginning") {
    return who === "учителя"
      ? "Орг. момент → психологический настрой → актуализация (кумулятивная беседа) → формулировка темы и критериев успеха."
      : "Настраиваются, отвечают на наводящие вопросы, формулируют ожидания, записывают тему.";
  }
  if (stage === "middle") {
    return who === "учителя"
      ? "Объяснение нового → демонстрация образца → организация парной/групповой работы → раздача дифференцированных карточек → физкультминутка."
      : "Слушают, делают записи, работают в парах/группах, выполняют задания по образцу и самостоятельные, помогают слабым.";
  }
  if (stage === "end") {
    return who === "учителя"
      ? "Подводит итог («3 вещи, которые я узнал»), проводит рефлексию («Лестница успеха»), даёт д/з с комментарием."
      : "Называют выводы, отвечают на рефлексивные вопросы, оценивают свою работу, записывают д/з.";
  }
  return "";
}

async function callAi(
  section: Section,
  stage: Stage | undefined,
  current: string | string[],
  ctx: { topic?: string; subject?: string; grade?: number; language?: "ru" | "kz" },
): Promise<string | string[]> {
  const { system, user, expectsList } = buildPrompt(section, stage, current, ctx);

  const raw = await executeWithFallback("enhance", async (client, model, config) => {
    const response = await client.chat.completions.create({
      model,
      // Хардкод 0.6/8192 игнорировал настройки провайдера: Groq с лимитом
      // OTPM 1000 отвечал 429, поэтому лимит берём из конфига.
      temperature: config.temperature ?? 0.6,
      max_completion_tokens: config.maxTokens ?? 8192,
      response_format: expectsList ? { type: "json_object" } : undefined,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return response.choices?.[0]?.message?.content?.trim() ?? "";
  });
  
  if (!expectsList) return raw;
  try {
    const parsed = JSON.parse(raw) as { items?: unknown };
    if (Array.isArray(parsed.items)) {
      return parsed.items.filter((x): x is string => typeof x === "string" && x.trim() !== "");
    }
  } catch {
    /* fall through */
  }
  return raw
    .split("\n")
    .map((l) => l.replace(/^[\s•\-\d.)]+/, "").trim())
    .filter(Boolean);
}

function fallbackImprove(
  section: Section,
  stage: Stage | undefined,
  current: string | string[],
  ctx: { topic?: string; subject?: string; grade?: number; language?: "ru" | "kz" },
): string | string[] {
  const topic = ctx.topic || "темы урока";
  switch (section) {
    case "lessonObjectives":
      return mergeList(current, [
        `Учащиеся смогут объяснить основные понятия по теме «${topic}»`,
        "Учащиеся применят изученный материал при решении практических задач",
        "Учащиеся проведут самооценку по предложенным критериям",
      ]);
    case "assessmentCriteria":
      return mergeList(current, [
        "Использует корректную терминологию",
        "Аргументирует свой выбор / решение",
        "Выполняет задание согласно инструкции",
      ]);
    case "languageObjectivesTerms":
      return mergeList(current, ["Ключевые термины темы", "Академическая лексика урока"]);
    case "languageObjectivesPhrases":
      return mergeList(current, [
        "Я считаю, что …, потому что …",
        "Сравнивая …, можно сделать вывод, что …",
        "Моё решение основано на …",
      ]);
    case "glossary":
      // Переводы нельзя выдумать детерминированно — без AI возвращаем как есть.
      return Array.isArray(current) ? current : [];
    case "values":
      return appendText(
        current,
        "Уважение к мнению одноклассников, ответственность за учебный результат, академическая честность.",
      );
    case "priorKnowledge":
      return appendText(
        current,
        `Учащиеся знакомы с базовыми понятиями, предшествующими теме «${topic}».`,
      );
    case "crossCurricularLinks":
      return appendText(
        current,
        "Связь с математикой/языком/естествознанием — через анализ данных и оформление выводов.",
      );
    case "formativeAssessment":
      return appendText(
        current,
        "Приёмы «Светофор», «Две звезды и пожелание», устная обратная связь по критериям.",
      );
    case "differentiation":
      return appendText(
        current,
        "Поддержка: карточки-опоры с алгоритмом для менее способных, работа в паре. Вызов: задание повышенной сложности / исследовательский вопрос для более способных.",
      );
    case "healthAndSafety":
      return appendText(
        current,
        "Физкультминутка в середине урока, контроль осанки, соблюдение норм работы с ИКТ.",
      );
    case "reflection":
      return appendText(
        current,
        "1) Достигнуты ли цели урока? 2) Какие приёмы сработали лучше? 3) Что изменить в следующий раз?",
      );
    case "teacherActions":
      return appendText(current, stageGuidance(stage, "учителя"));
    case "studentActions":
      return appendText(current, stageGuidance(stage, "учеников"));
    case "resources":
      return appendText(
        current,
        "Учебник, презентация, раздаточные карточки (3 уровня), интерактивная доска.",
      );
    case "keyQuestions":
      return mergeList(
        current,
        stage === "beginning"
          ? [
              `Что вы помните по теме, связанной с «${topic}»?`,
              "Где это может пригодиться в жизни?",
              "Какие у вас остались вопросы с прошлого урока?",
            ]
          : stage === "end"
            ? [
                `Что нового вы узнали о «${topic}»?`,
                "Какой вывод вы сделали для себя?",
              ]
            : [
                `Какое ключевое свойство «${topic}» вы заметили?`,
                "Как изменится результат, если поменять одно из условий?",
              ],
      );
    case "descriptors":
      return mergeList(current, [
        "Записывает определение / алгоритм",
        "Приводит не менее двух примеров",
        "Решает задачу по образцу",
        "Сравнивает свои выводы с эталоном",
      ]);
    case "reflectionQuestions":
      return mergeList(current, [
        "Что было легко?",
        "Что было сложно?",
        "Что вам особенно понравилось?",
      ]);
    case "homework":
      return appendText(
        current,
        `Прочитать соответствующий параграф учебника и выполнить 2–3 задания по теме «${topic}».`,
      );
    case "summary":
      return appendText(
        current,
        `На уроке мы изучили тему «${topic}»: ключевые понятия, основные свойства и примеры применения.`,
      );
  }
}

function mergeList(current: string | string[], extras: string[]): string[] {
  const items = Array.isArray(current) ? current : current.split("\n").filter((x) => x.trim());
  const set = new Set(items.map((x) => x.trim().toLowerCase()));
  for (const x of extras) if (!set.has(x.trim().toLowerCase())) items.push(x);
  return items;
}

function appendText(current: string | string[], extra: string): string {
  const cur = Array.isArray(current) ? current.join("\n") : current;
  const trimmed = (cur || "").trim();
  if (!trimmed) return extra;
  if (trimmed.toLowerCase().includes(extra.slice(0, 24).toLowerCase())) return trimmed;
  return `${trimmed}\n\n${extra}`;
}
