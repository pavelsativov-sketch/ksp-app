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
  refine?: boolean;
  onStage?: (stage: KspStage) => void;
  /** Внешний сигнал отмены (прерывает запрос к провайдеру). */
  signal?: AbortSignal;
}

export interface KspStage {
  percent: number;
  label: string;
}

export interface GenerateKspResult {
  payload: AiKspPayload;
  model: string;
}

let lastGenerationModel = "unknown";

export function getLastGenerationModel(): string {
  return lastGenerationModel;
}

export async function generateKsp(input: GenerateKspOptions): Promise<AiKspPayload> {
  const r = await generateKspWithModel(input);
  return r.payload;
}

export async function generateKspWithModel(input: GenerateKspOptions): Promise<GenerateKspResult> {
  const stage = input.onStage;
  if (!isOpenAIConfigured()) {
    throw new Error("Не настроен ни один AI-провайдер. Добавьте рабочий ключ провайдера в окружение приложения.");
  }
  stage?.({ percent: 20, label: "Составляем ход урока" });
  let capturedModel = "unknown";
  // Бюджет на один проход: при refine суммарно не должен превышать maxDuration
  // роута (120 с), иначе платформа обрежет супервизор-проход на середине.
  const passBudgetMs = input.refine ? 50_000 : 90_000;
  const draft = await executeWithFallback("generation", async (client, model, config, signal) => {
    capturedModel = model;
    lastGenerationModel = model;
    const response = await client.chat.completions.create(
      {
        model,
        temperature: config.temperature ?? 0.7,
        max_completion_tokens: config.maxTokens ?? 8192,
        messages: [
          { role: "system", content: buildSystemPrompt(input.language) },
          { role: "user", content: buildUserPrompt(input) },
        ],
        response_format: getResponseFormat(config, OPENAI_JSON_SCHEMA),
      },
      { signal },
    );
    const choice = response.choices[0];
    const raw = choice?.message.content;
    if (!raw || !raw.trim()) throw new Error("AI вернул пустой ответ");
    if (choice?.finish_reason === "length") {
      throw new Error(`AI оборвал ответ на лимите ${config.maxTokens ?? 8192} токенов — план не дописан`);
    }
    return parseAndValidate(raw, input.topic, input.language);
  }, { budgetMs: passBudgetMs, signal: input.signal });

  if (!input.refine) {
    stage?.({ percent: 100, label: "План готов" });
    return { payload: draft, model: capturedModel };
  }

  stage?.({ percent: 55, label: "Черновик готов, проверяем методистом" });
  try {
    const refined = await executeWithFallback("generation", async (client, model, config, signal) => {
      capturedModel = model;
      lastGenerationModel = model;
      const response = await client.chat.completions.create(
        {
          model,
          temperature: 0.5,
          max_completion_tokens: config.maxTokens ?? 8192,
          messages: [
            { role: "system", content: "Ты Главный Методист-Супервизор Министерства Образования РК. Твоя задача — проверить черновик плана урока (КСП) и исправить все логические, методические и стилистические ошибки. Убедись, что цели SMART, критерии оценивания проверяемые, а действия учителя и учеников максимально подробные и дифференцированные. Верни улучшенный JSON-объект." },
            { role: "user", content: `Исходные требования: Тема «${input.topic}», Класс: ${input.grade}, Предмет: ${input.subject}\n\nЧерновик КСП (JSON):\n${JSON.stringify(draft, null, 2)}\n\nПроанализируй и улучши этот план. Верни полностью готовый исправленный JSON по схеме.` },
          ],
          response_format: getResponseFormat(config, OPENAI_JSON_SCHEMA),
        },
        { signal },
      );
      const choice = response.choices[0];
      const raw = choice?.message.content;
      if (!raw) throw new Error("Supervisor AI не вернул ответ");
      if (choice?.finish_reason === "length") throw new Error("Supervisor AI оборвал ответ на лимите токенов");
      return parseAndValidate(raw, input.topic, input.language);
    });
    stage?.({ percent: 100, label: "План готов и проверен методистом" });
    return { payload: refined, model: capturedModel };
  } catch (err) {
    log.warn("Второй проход супервизора не удался, отдаём черновик", { topic: input.topic, reason: err instanceof Error ? err.message : String(err) });
    stage?.({ percent: 100, label: "Черновик готов (проверка методистом не завершилась)" });
    return { payload: draft, model: capturedModel };
  }
}

export function normalizeTextFields<T>(value: T): T {
  const STRING_KEYS = new Set(["time","teacherActions","studentActions","resources","assessmentMethod","homework","summary","question","hint","objectiveCode","unit","template","id","code","text","name","topic","instruction","criteria","expectedResult","differentiation","reflection","formativeAssessment","healthAndSafety","values","crossCurricularLinks","priorKnowledge"]);
  const LIST_KEYS = new Set(["lessonObjectives","reflectionQuestions","assessmentCriteria","keyQuestions","descriptors","terms","phrases","acceptedAnswers","options","left","right","items","answers"]);
  const NUMBER_KEYS = new Set(["answer","tolerance"]);
  const WRAPPER_KEYS = ["text","description","value","content","title"];
  const RENAMES: Record<string, string> = { acceptedAnswer: "answer", solutions: "answer" };
  const isScalar = (input: unknown): boolean => !Array.isArray(input);
  const toText = (input: unknown): string => {
    if (input === null || input === undefined) return "";
    if (typeof input === "string") return input.trim();
    if (typeof input === "number" || typeof input === "boolean") return String(input);
    if (Array.isArray(input)) return input.map((item) => toText(item)).filter((text) => text.length > 0).join("; ");
    if (typeof input === "object") {
      const entries = Object.entries(input as Record<string, unknown>);
      if (entries.length === 1 && WRAPPER_KEYS.includes(entries[0]![0])) return toText(entries[0]![1]);
      return entries.map(([key, item]) => { const text = toText(item); return text ? `${key}: ${text}` : ""; }).filter(Boolean).join("; ");
    }
    return String(input);
  };
  const toStringList = (input: unknown): string[] => { const parts = Array.isArray(input) ? input : [input]; return parts.map((item) => toText(item)).filter((text) => text.length > 0); };
  const toNumber = (input: unknown): unknown => {
    if (typeof input === "number") return input;
    if (typeof input !== "string") return input;
    const cleaned = input.trim().replace(",", ".").replace(/[^\d.eE+-]/g, "");
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
        const renamed = RENAMES[key];
        if (renamed && !(renamed in source)) { out[renamed] = toNumber(item); continue; }
        if (key === "answers" && isScalar(item) && !("answer" in source)) { out.answer = toNumber(item); continue; }
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
  const withDefaults = normalizeTextFields({
    header: { longTermPlanSection: "", school: "", date: "", teacherName: "", grade: "", studentsPresent: null, studentsAbsent: null },
    learningObjectives: [], ...parsed,
    evaluation: parsed.evaluation ?? { formativeAssessment: "", differentiation: "", healthAndSafety: "", reflection: "" },
  });
  const checked = kspContentSchema.safeParse(withDefaults);
  if (!checked.success) {
    const detail = checked.error.issues.map((i) => `${i.path.join(".") || "корень"}: ${i.message}`).slice(0, 6).join("; ");
    throw new Error(`AI вернул некорректный КСП: ${detail.slice(0, 400)}`);
  }
  if (language === "kz") assertKazakhKsp(checked.data);
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
  if (russianTokens.length >= 3) throw new Error("KSP Kazakh language check failed: Russian text remains in the generated lesson plan");
}

export { mergeAiIntoKsp, type AiKspPayload } from "./merge";
