import {
  buildSystemPrompt,
  buildUserPrompt,
  OPENAI_JSON_SCHEMA,
  type AiKspPayload,
  type GenerateKspInput,
} from "./prompt";
import {
  executeWithFallback,
  getResponseFormat,
  isAnyProviderConfigured,
} from "./providers";
import { kspContentSchema } from "@/lib/validation/ksp";
import { extractJson } from "./extract-json";
import { log } from "@/lib/logger";

export function isOpenAIConfigured(): boolean {
  return isAnyProviderConfigured();
}

export interface GenerateKspOptions extends GenerateKspInput {
  /** Второй проход супервизора. По умолчанию выключен: удваивает цену/время. */
  refine?: boolean;
  /**
   * Отчёт о ходе генерации.
   *
   * Раньше экран ожидания рисовал проценты по таймеру: они не были связаны с
   * реальной работой и оставались на 10% всё время, пока модель думала. Теперь
   * каждая отметка приходит из настоящей точки пайплайна, поэтому учитель
   * видит, что именно идёт, и понимает, что процесс не завис.
   */
  onStage?: (stage: KspStage) => void;
}

/** Этап генерации с честным процентом. */
export interface KspStage {
  /** Готовность в процентах: 100 — работа завершена. */
  percent: number;
  /** Что происходит, по-русски, для учителя. */
  label: string;
}

/**
 * Generate a KSP body (everything except header and learningObjectives).
 * План не подменяется демонстрационным текстом: без активного провайдера
 * вызывающий слой получает понятную ошибку и может показать ручной редактор.
 * По умолчанию — один проход; refine=true включает второй проход супервизора.
 */
export async function generateKsp(
  input: GenerateKspOptions,
): Promise<AiKspPayload> {
  const stage = input.onStage;
  if (!isOpenAIConfigured()) {
    throw new Error("Не настроен ни один AI-провайдер. Добавьте рабочий ключ провайдера в окружение приложения.");
  }
  stage?.({ percent: 20, label: "Составляем ход урока" });
  const draft = await executeWithFallback("generation", async (client, model, config) => {
    const response = await client.chat.completions.create({
      model,
      // Раньше здесь стояли хардкод 0.7/8192, из-за чего настройки провайдера
      // игнорировались: Groq с лимитом OTPM 1000 получал max_completion_tokens
      // 8192 и отвечал 429 на каждом запросе.
      temperature: config.temperature ?? 0.7,
      max_completion_tokens: config.maxTokens ?? 8192,
      messages: [
        { role: "system", content: buildSystemPrompt(input.language) },
        { role: "user", content: buildUserPrompt(input) },
      ],
      response_format: getResponseFormat(config, OPENAI_JSON_SCHEMA),
    });

    const choice = response.choices[0];
    const raw = choice?.message.content;
    if (!raw || !raw.trim()) throw new Error("AI вернул пустой ответ");
    // Обрыв на лимите токенов ловится явно: `extractJson` попытается закрыть
    // JSON, но у обрезанного плана теряется конец урока (домашнее задание и
    // рефлексия). Такой ответ нельзя молча чинить — на нём каскад провайдеров
    // должен переключиться на того, у кого лимит больше.
    if (choice?.finish_reason === "length") {
      throw new Error(
        `AI оборвал ответ на лимите ${config.maxTokens ?? 8192} токенов — план не дописан`,
      );
    }
    return parseAndValidate(raw, input.topic, input.language);
  });

  if (!input.refine) {
    stage?.({ percent: 100, label: "План готов" });
    return draft;
  }

  stage?.({ percent: 55, label: "Черновик готов, проверяем методистом" });

  // Step 2: AI Supervisor Pass (Methodologist Review) — только по явному запросу.
  //
  // Второй проход не обязан удаться: черновик уже готов и пригоден к работе.
  // Раньше любой сбой здесь отменял всю генерацию, и учитель, запросивший
  // улучшение, оставался вовсе без плана.
  try {
    const refined = await executeWithFallback("generation", async (client, model, config) => {
      const response = await client.chat.completions.create({
        model,
        temperature: 0.5, // lower temperature for more analytical review
        // Лимит берётся у провайдера: хардкод 8192 уходил в 429 на Groq,
        // где потолок 1536, и второй проход всегда падал.
        max_completion_tokens: config.maxTokens ?? 8192,
      messages: [
          {
            role: "system",
            content: "Ты Главный Методист-Супервизор Министерства Образования РК. Твоя задача — проверить черновик плана урока (КСП) и исправить все логические, методические и стилистические ошибки. Убедись, что цели SMART, критерии оценивания проверяемые, а действия учителя и учеников максимально подробные и дифференцированные. Верни улучшенный JSON-объект."
          },
          {
            role: "user",
            content: `Исходные требования: Тема «${input.topic}», Класс: ${input.grade}, Предмет: ${input.subject}\n\nЧерновик КСП (JSON):\n${JSON.stringify(draft, null, 2)}\n\nПроанализируй и улучши этот план. Верни полностью готовый исправленный JSON по схеме.`
          },
        ],
        response_format: getResponseFormat(config, OPENAI_JSON_SCHEMA),
      });

      const choice = response.choices[0];
      const raw = choice?.message.content;
      if (!raw) throw new Error("Supervisor AI не вернул ответ");
      if (choice?.finish_reason === "length") {
        throw new Error("Supervisor AI оборвал ответ на лимите токенов");
      }
      return parseAndValidate(raw, input.topic, input.language);
    });

    stage?.({ percent: 100, label: "План готов и проверен методистом" });
    return refined;
  } catch (err) {
    log.warn("Второй проход супервизора не удался, отдаём черновик", {
      topic: input.topic,
      reason: err instanceof Error ? err.message : String(err),
    });
    // Учитель должен понимать, что он получит: черновик, а не улучшенный план.
    stage?.({ percent: 100, label: "Черновик готов (проверка методистом не завершилась)" });
    return draft;
  }
}

/**
 * Извлекает JSON из ответа и валидирует по схеме КСП.
 *
 * Разбор отдан общему `extractJson`: здесь раньше жил собственный урезанный
 * вариант, который не умел закрывать обрезанный ответ. Модель безлимитовых
 * провайдеров обрывает JSON на середине (`finish_reason=length`), и такой
 * ответ уходил в 500 вместо того, чтобы разобраться и показать план.
 */
/**
 * Приводит текстовые поля КСП к строке там, где модель написала список
 * или объект.
 *
 * Зачем: схема ждёт в `teacherActions` строку, а модели (особенно gpt-oss)
 * часто пишут туда список пунктов или объект с подпунктами. Раньше такой
 * ответ отбрасывался целиком с «Invalid input: expected string, received
 * object» — то есть из-за формы терялся готовый, содержательно верный урок.
 * Содержание не выдумывается: список склеивается в строку, объект
 * разворачивается в «ключ: значение», ничего не выбрасывается.
 */
export function normalizeTextFields<T>(value: T): T {
  // Поля, где схема ждёт строку. Найдено по живым отказам: gpt-oss пишет
  // сюда списки и объекты («expected string, received object»), и раньше
  // из-за формы отбрасывался весь готовый урок.
  const STRING_KEYS = new Set([
    "time",
    "teacherActions",
    "studentActions",
    "resources",
    "assessmentMethod",
    "homework",
    "summary",
    "name",
    "topic",
    "instruction",
    "criteria",
    "expectedResult",
    "differentiation",
    "reflection",
    "formativeAssessment",
  ]);

  // Поля, где схема ждёт МАССИВ строк. Их нельзя склеивать: документ
  // показывает пункты по отдельности.
  const LIST_KEYS = new Set(["lessonObjectives", "reflectionQuestions"]);

  // Поля, где схема ждёт число, а модель пишет строку («7» вместо 7).
  const NUMBER_KEYS = new Set(["answer", "tolerance"]);

  /** Ключи-обёртки: модель пишет {text: "…"} — берём содержимое, а не «text: …». */
  const WRAPPER_KEYS = ["text", "description", "value", "content", "title"];

  /**
   * Переименования полей.
   *
   * Найдено по живому отказу: числовое задание (NUMERIC) требует `answer`, а
   * модель писала `answers` — поле для FILL_BLANK, то есть перепутала
   * названия разных типов заданий. Из-за одного имени отбрасывался весь урок.
   * Переименование выполняется только если нужного поля ещё нет: так
   * «правильное» поле ответа никогда не затирается.
   */
  const RENAMES: Record<string, string> = {
    acceptedAnswer: "answer",
    solutions: "answer",
  };

  /**
   * `answers` живёт сразу в двух ролях: у FILL_BLANK это массив подходящих
   * ответов, у NUMERIC — ошибочно написанное числовое `answer`. Переименовывать
   * можно только одиночное значение: иначе у задания на пропуск пропадал бы
   * список ответов и оставалось одно число.
   */
  const isScalar = (input: unknown): boolean => !Array.isArray(input);

  const toText = (input: unknown): string => {
    if (input === null || input === undefined) return "";
    if (typeof input === "string") return input.trim();
    if (typeof input === "number" || typeof input === "boolean") return String(input);
    if (Array.isArray(input)) {
      return input
        .map((item) => toText(item))
        .filter((text) => text.length > 0)
        .join("; ");
    }
    if (typeof input === "object") {
      const entries = Object.entries(input as Record<string, unknown>);
      // Обёртка с одним текстовым полем — это просто текст.
      if (entries.length === 1 && WRAPPER_KEYS.includes(entries[0]![0])) {
        return toText(entries[0]![1]);
      }
      return entries
        .map(([key, item]) => {
          const text = toText(item);
          return text ? `${key}: ${text}` : "";
        })
        .filter(Boolean)
        .join("; ");
    }
    return String(input);
  };

  /** Массив строк из значения любой формы. */
  const toStringList = (input: unknown): string[] => {
    const parts = Array.isArray(input) ? input : [input];
    return parts.map((item) => toText(item)).filter((text) => text.length > 0);
  };

  /** Число из строки: «7» → 7, «7,5» → 7.5. Мусор остаётся как был. */
  const toNumber = (input: unknown): unknown => {
    if (typeof input === "number") return input;
    if (typeof input !== "string") return input;
    const cleaned = input.trim().replace(",", ".").replace(/[^\d.eE+-]/g, "");
    // Number("") === 0: без этой проверки «нет ответа» превратился бы в ноль,
    // то есть в выдуманное значение ответа.
    if (cleaned.length === 0) return input;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : input;
  };

  const walk = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map((item) => walk(item));
    if (input && typeof input === "object") {
      const out: Record<string, unknown> = {};
      const source = input as Record<string, unknown>;
      for (const [key, item] of Object.entries(source)) {
        // Переименование не должно затирать уже существующее правильное поле.
        const renamed = RENAMES[key];
        if (renamed && !(renamed in source)) {
          out[renamed] = toNumber(item);
          continue;
        }
        if (key === "answers" && isScalar(item) && !("answer" in source)) {
          out.answer = toNumber(item);
          continue;
        }
        if (LIST_KEYS.has(key)) out[key] = toStringList(item);
        else if (STRING_KEYS.has(key)) out[key] = toText(item);
        else if (NUMBER_KEYS.has(key)) out[key] = toNumber(item);
        else out[key] = walk(item);
      }
      return out;
    }
    return input;
  };

  return walk(value) as T;
}

function parseAndValidate(raw: string, fallbackTopic: string, language: "ru" | "kz"): AiKspPayload {
  const parsed = extractJson<AiKspPayload>(raw);
  if (!parsed.topic) parsed.topic = fallbackTopic;
  // Мягкая валидация: AI возвращает тело без header/learningObjectives.
  //
  // Блок `evaluation` тоже заполняем заранее. Модели регулярно его не
  // присылают, и раньше из-за одного отсутствующего раздела отбрасывался
  // весь готовый урок. Пустые строки честны: учитель увидит незаполненные
  // поля и допишет их сам — это лучше, чем 503 и никакого плана.
  const withDefaults = normalizeTextFields({
    header: {
      longTermPlanSection: "", school: "", date: "", teacherName: "",
      grade: "", studentsPresent: null, studentsAbsent: null,
    },
    learningObjectives: [],
    ...parsed,
    // Ставится ПОСЛЕ разбора: значение от модели важнее заглушки, но если
    // блока нет вовсе — учитель получает пустые поля вместо отказа всей
    // генерации. Порядок важен: заглушка до разбора затирала бы ответ модели.
    evaluation: parsed.evaluation ?? {
      formativeAssessment: "",
      differentiation: "",
      healthAndSafety: "",
      reflection: "",
    },
  });
  const checked = kspContentSchema.safeParse(withDefaults);
  if (!checked.success) {
    // Путь поля обязателен: сообщение вида «expected string, received
    // object» не говорит, ЧТО чинить. С путём видно конкретное поле, и по
    // нему можно либо починить нормализацию, либо показать учителю, какой
    // раздел не заполнился.
    const detail = checked.error.issues
      .map((i) => `${i.path.join(".") || "корень"}: ${i.message}`)
      .slice(0, 6)
      .join("; ");
    throw new Error(`AI вернул некорректный КСП: ${detail.slice(0, 400)}`);
  }
  // Проверка языка идёт по нормализованным данным, а не по сырому ответу:
  // сырой мог содержать ключи, отброшенные схемой.
  if (language === "kz") assertKazakhKsp(checked.data);
  // Возвращаются данные после схемы, а не исходный объект. Раньше возвращался
  // `parsed`, где оставались поля, отброшенные схемой, и `null` вместо
  // значений по умолчанию: дальше по коду это приводило к «undefined» в
  // документе и к падениям на `.map()`.
  return checked.data as AiKspPayload;
}

function assertKazakhKsp(payload: AiKspPayload): void {
  const flatten = (value: unknown): string[] => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(flatten);
    if (typeof value === "object" && value !== null) return Object.values(value).flatMap(flatten);
    return [];
  };
  const text = flatten({ ...payload, topic: undefined }).join(" ").toLocaleLowerCase("kk-KZ");
  const russianTokens = text.match(/(?<![\p{L}\p{N}_])(?:учащиеся|ученики|педагог|задание|урок|выполняют|объясняют|ответы|домашнее|оценивание|критерии|начало|середина|конец)(?![\p{L}\p{N}_])/gu) ?? [];
  if (russianTokens.length >= 3) {
    throw new Error("KSP Kazakh language check failed: Russian text remains in the generated lesson plan");
  }
}



// mergeAiIntoKsp живёт в ./merge: функция чистая и нужна клиентскому
// plan-form, который не должен тянуть серверные AI-провайдеры.
export { mergeAiIntoKsp, type AiKspPayload } from "./merge";
