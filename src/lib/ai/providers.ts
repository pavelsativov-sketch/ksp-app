/**
 * Центральный конфиг AI-провайдеров с поддержкой умного фоллбэка.
 *
 * Каждая задача платформы имеет список предпочитаемых моделей.
 * Платформа пробует первую модель, и при ошибке (лимиты, баланс, недоступность)
 * автоматически переключается на следующую.
 *
 * Порядок по задачам задаётся ниже. Для коротких заданий первым стоит
 * провайдер, который проверен живым вызовом инструмента и быстро отвечает.
 * Недоступный ключ пропускается, не подменяется.
 */

import OpenAI from "openai";
import { logAiEvent } from "./telemetry";
import { log } from "@/lib/logger";

export type AiTask = "generation" | "enhance" | "tasks" | "image" | "vision";

export interface ProviderConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  supportsJsonSchema: boolean;
  label: string;
  /** Оптимальная температура для этой модели/задачи */
  temperature?: number;
  /** Максимальное количество токенов ответа */
  maxTokens?: number;
  /**
   * Все ключи провайдера по порядку.
   *
   * Зачем: у Gemini суточный лимит исчерпывается и первый ключ начинает
   * отдавать 429, хотя второй ключ того же провайдера работает. Без списка
   * каскад считал провайдера мёртвым и падал, хотя резерв был под рукой.
   * Ключи перебираются по одному на каждый сбой авторизации или лимита.
   */
  apiKeys?: string[];
}

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/";
const GROQ_BASE = "https://api.groq.com/openai/v1";
const CEREBRAS_BASE = "https://api.cerebras.ai/v1";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const OPENAI_BASE = "https://api.openai.com/v1";
const XAI_BASE = "https://api.x.ai/v1";

/**
 * Ключи провайдера из переменной окружения.
 *
 * Несколько ключей перечисляются через запятую — так в запас уходит второй
 * ключ, если первый упёрся в суточный лимит.
 */
export function parseApiKeys(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

const keys = {
  openai: () => parseApiKeys(process.env.OPENAI_API_KEY),
  xai: () => parseApiKeys(process.env.XAI_API_KEY || process.env.GROK_API_KEY),
  gemini: () => parseApiKeys(process.env.GEMINI_API_KEY),
  groq: () => parseApiKeys(process.env.GROQ_API_KEY),
  cerebras: () => parseApiKeys(process.env.CEREBRAS_API_KEY),
  openrouter: () => parseApiKeys(process.env.OPENROUTER_API_KEY),
};

/** Ставит список ключей в конфиг: первый — основной, остальные — резерв. */
function withKeys(
  config: Omit<ProviderConfig, "apiKey" | "apiKeys"> & { apiKeys: string[] },
): ProviderConfig {
  const { apiKeys, ...rest } = config;
  return { ...rest, apiKey: apiKeys[0] ?? "", apiKeys };
}

/** Провайдер без ключей отбрасывается: пустой ключ занял бы попытку. */
function configured(config: ProviderConfig): boolean {
  return Boolean(config.apiKey);
}

// ── Массивы провайдеров (от лучшего к запасному) ────────────────

/**
 * Реальная проверка ключей (2026-10-07):
 *   Gemini  — оба ключа возвращают 429; оставлены основным провайдером,
 *             но запрос должен переключаться на следующий доступный;
 *   Groq    — оба ключа отвечают 200. Второй ключ сохранён как резерв на
 *             случай отзыва/ошибки авторизации основного;
 *   xAI     — поддерживается, но для живой проверки нужен XAI_API_KEY или
 *             GROK_API_KEY в окружении;
 *   OpenAI  — 401 Incorrect API key (в системном окружении лежит
 *             OPENAI_API_KEY=sk-cvc-8…, это не ключ OpenAI);
 *   Cerebras— 402 payment_required (аккаунт без баланса);
 *   OpenRouter — 401 Missing Authentication header (ключ не в формате sk-or-v1-);
 *   Anthropic — через OpenAI-клиент несовместим с /v1/chat/completions.
 *
 * Мёртвые провайдеры оставлены последними: если ключи оживут, каскад
 * подхватит их автоматически, но больше не тратит 1–3 секунды на каждый
 * заведомо нерабочий запрос.
 */
const TASK_CONFIGS: Record<AiTask, () => ProviderConfig[]> = {
  generation: () => [
    // Gemini — основной маршрут. Ключи перебираются: первый может упереться
    // в суточный лимит, пока второй ещё живой.
    withKeys({ apiKeys: keys.gemini(), baseURL: GEMINI_BASE, model: "gemini-3.8-flash", supportsJsonSchema: false, label: "Gemini 3.8 Flash (Primary)", temperature: 0.7, maxTokens: 8192 }),
    // Groq GPT OSS 120B — резерв. Три изменения по живым замерам 2026-10-07:
    //  1) maxTokens поднят 1536 → 8192: при 1536 план обрывался на середине,
    //     generateKsp это видел и уводил каскад дальше, то есть резерв был
    //     структурно непригоден, пока Gemini был жив;
    //  2) supportsJsonSchema выключен: gpt-oss — рассуждающая модель, и на
    //     строгой схеме КСП она отдавала 400 «'/stages/beginning/tasks/0'
    //     does not validate». Схема глубокая (этапы → задачи), и одна
    //     несовпавшая мелочь отбрасывала весь план;
    //  3) response_format не задаётся вовсе: и json_schema, и json_object
    //     для этой модели заканчивались 400 («Failed to generate JSON»).
    //     Формат задаёт промпт, а приводит ответ к схеме наш extractJson —
    //     он умеет снимать ограждения и закрывать обрезанный JSON.
    withKeys({ apiKeys: keys.groq(), baseURL: GROQ_BASE, model: "openai/gpt-oss-120b", supportsJsonSchema: false, label: "Groq GPT OSS 120B (Fallback 1)", temperature: 0.7, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.xai(), baseURL: XAI_BASE, model: "grok-4.7", supportsJsonSchema: false, label: "xAI Grok 4.7 (Fallback 2)", temperature: 0.7, maxTokens: 8192 }),
    // OpenAI GPT-4o — лучшее качество, если ключ будет валидным.
    withKeys({ apiKeys: keys.openai(), baseURL: OPENAI_BASE, model: "gpt-4o", supportsJsonSchema: true, label: "OpenAI GPT-4o (Fallback 2)", temperature: 0.7, maxTokens: 8192 }),
    // Cerebras — быстрая бесплатная модель
    withKeys({ apiKeys: keys.cerebras(), baseURL: CEREBRAS_BASE, model: "gpt-oss-120b", supportsJsonSchema: true, label: "Cerebras GPT OSS 120B (Fallback 3)", temperature: 0.7, maxTokens: 8192 }),
    // OpenRouter — последний резерв. Слаг без «:free»: провайдер отвечает
    // 404 «This model is unavailable for free» и прямо называет рабочий
    // вариант — тот и стоит в каскаде последним аварийным маршрутом.
    withKeys({ apiKeys: keys.openrouter(), baseURL: OPENROUTER_BASE, model: "nex-agi/nex-n2.5-pro", supportsJsonSchema: false, label: "OpenRouter Nex 2.5 Pro (Free Emergency Fallback)", temperature: 0.7, maxTokens: 8192 }),
  ],
  enhance: () => [
    // Gemini — основной маршрут: улучшение секций короткое, ответ быстрый.
    withKeys({ apiKeys: keys.gemini(), baseURL: GEMINI_BASE, model: "gemini-3.8-flash", supportsJsonSchema: false, label: "Gemini 3.8 Flash (Primary)", temperature: 0.5, maxTokens: 8192 }),
    // Groq — резерв. 8192 проверено вживую: улучшение секций короткое,
    // провайдер отдаёт ответ целиком.
    withKeys({ apiKeys: keys.groq(), baseURL: GROQ_BASE, model: "openai/gpt-oss-120b", supportsJsonSchema: true, label: "Groq GPT OSS 120B (Fallback 1)", temperature: 0.5, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.xai(), baseURL: XAI_BASE, model: "grok-4.7", supportsJsonSchema: false, label: "xAI Grok 4.7 (Fallback 2)", temperature: 0.5, maxTokens: 8192 }),
    // OpenAI GPT-4o-mini — быстрая и качественная для редактирования
    withKeys({ apiKeys: keys.openai(), baseURL: OPENAI_BASE, model: "gpt-4o-mini", supportsJsonSchema: true, label: "OpenAI GPT-4o-mini (Fallback 2)", temperature: 0.5, maxTokens: 8192 }),
    // Cerebras
    withKeys({ apiKeys: keys.cerebras(), baseURL: CEREBRAS_BASE, model: "gpt-oss-120b", supportsJsonSchema: true, label: "Cerebras GPT OSS 120B (Fallback 3)", temperature: 0.5, maxTokens: 8192 }),
    // OpenRouter — слаг без «:free», см. пояснение в generation.
    withKeys({ apiKeys: keys.openrouter(), baseURL: OPENROUTER_BASE, model: "nex-agi/nex-n2.5-pro", supportsJsonSchema: false, label: "OpenRouter Nex 2.5 Pro (Free Emergency Fallback)", temperature: 0.5, maxTokens: 8192 }),
  ],
  tasks: () => [
    // Groq проверен живым вызовом listFiles: tool_calls вернулся за 808 мс.
    // Ставим его первым, чтобы короткие задания не ждали медленный Gemini.
    withKeys({ apiKeys: keys.groq(), baseURL: GROQ_BASE, model: "openai/gpt-oss-120b", supportsJsonSchema: false, label: "Groq GPT OSS 120B (Primary)", temperature: 0.2, maxTokens: 8192 }),
    // Gemini остаётся резервом после быстрого проверенного маршрута.
    withKeys({ apiKeys: keys.gemini(), baseURL: GEMINI_BASE, model: "gemini-3.8-flash", supportsJsonSchema: false, label: "Gemini 3.8 Flash (Fallback 1)", temperature: 0.2, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.xai(), baseURL: XAI_BASE, model: "grok-4.7", supportsJsonSchema: false, label: "xAI Grok 4.7 (Fallback 2)", temperature: 0.7, maxTokens: 8192 }),
    // Groq GPT OSS 20B — быстрый резерв.
    withKeys({ apiKeys: keys.groq(), baseURL: GROQ_BASE, model: "openai/gpt-oss-20b", supportsJsonSchema: true, label: "Groq GPT OSS 20B (Fallback 2)", temperature: 0.7, maxTokens: 8192 }),
    // OpenAI GPT-4o-mini — лучший структурированный JSON, если ключ рабочий.
    withKeys({ apiKeys: keys.openai(), baseURL: OPENAI_BASE, model: "gpt-4o-mini", supportsJsonSchema: true, label: "OpenAI GPT-4o-mini (Fallback 3)", temperature: 0.7, maxTokens: 8192 }),
    // Cerebras
    withKeys({ apiKeys: keys.cerebras(), baseURL: CEREBRAS_BASE, model: "gpt-oss-120b", supportsJsonSchema: true, label: "Cerebras GPT OSS 120B (Fallback 4)", temperature: 0.7, maxTokens: 8192 }),
    // OpenRouter. Слаг :free у nex-agi отозван (404), поэтому берём pro без
    // суффикса — он остаётся в каскаде последним аварийным маршрутом.
    withKeys({ apiKeys: keys.openrouter(), baseURL: OPENROUTER_BASE, model: "nex-agi/nex-n2.5-mini", supportsJsonSchema: false, label: "OpenRouter Nex Mini (Free Emergency Fallback)", temperature: 0.7, maxTokens: 8192 }),
  ],
  image: () => [
    // Gemini 3.8 Flash — основная модель генерации изображений (яркие цвета).
    withKeys({ apiKeys: keys.gemini(), baseURL: "https://generativelanguage.googleapis.com/v1beta/", model: "gemini-3.8-flash", supportsJsonSchema: false, label: "Gemini 3.8 Flash (Primary Image)", temperature: 1.0, maxTokens: 8192 }),
    // OpenAI DALL-E 3 — fallback для генерации изображений
    withKeys({ apiKeys: keys.openai(), baseURL: OPENAI_BASE, model: "dall-e-3", supportsJsonSchema: false, label: "OpenAI DALL-E 3 (Fallback Image)", temperature: 0.7, maxTokens: 4096 }),
  ],
  // Зрение для агента «Использование компьютера» — модель должна одновременно
  // принимать снимок экрана и вызывать инструменты.
  //
  // Проверено вживую 2026-10-06 на Groq:
  //   qwen/qwen3.8-27b      — принимает image_url И возвращает tool_calls
  //                           с координатами в диапазоне 0–999. Рабочая.
  //   openai/gpt-oss-120b   — 400 «messages[0].content must be a string»: Groq
  //                           не отдаёт мультимодальность этой модели.
  //   openai/gpt-oss-20b    — та же ошибка.
  // Поэтому gpt-oss в vision-каскад НЕ включён: он там был бы мёртвым и
  // съедал бы по 1–3 секунды на каждый бесполезный запрос.
  vision: () => [
    withKeys({ apiKeys: keys.groq(), baseURL: GROQ_BASE, model: "qwen/qwen3.8-27b", supportsJsonSchema: false, label: "Groq Qwen 3.8 27B Vision (Primary)", temperature: 0.1, maxTokens: 1024 }),
    // Gemini — резерв: умеет зрение, и второй его ключ держит отдельную квоту,
    // поэтому каскад переключается на него, когда Groq исчерпал суточный лимит.
    withKeys({ apiKeys: keys.gemini(), baseURL: GEMINI_BASE, model: "gemini-3.8-flash", supportsJsonSchema: false, label: "Gemini 3.8 Flash Vision (Fallback)", temperature: 0.1, maxTokens: 2048 }),
  ],
};

export type AiResponseFormat =
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: { name: string; schema: Record<string, unknown>; strict: boolean } }
  | undefined;

export function isAnyProviderConfigured(): boolean {
  return Boolean(
    keys.openai().length ||
      keys.xai().length ||
      keys.gemini().length ||
      keys.groq().length ||
      keys.cerebras().length ||
      keys.openrouter().length,
  );
}

export function getResponseFormat(
  config: ProviderConfig,
  schemaConfig?: { name: string; schema: Record<string, unknown> },
): AiResponseFormat {
  // Qwen on Cerebras doesn't fully support strict JSON Schema, only json_object
  if (config.model.includes("qwen")) {
    return { type: "json_object" };
  }
  if (config.supportsJsonSchema && schemaConfig) {
    return {
      type: "json_schema",
      json_schema: {
        name: schemaConfig.name,
        schema: schemaConfig.schema,
        strict: true
      }
    };
  }
  return undefined;
}

/**
 * Выполняет задачу с использованием OpenAI-клиента, автоматически
 * перебирая резервных провайдеров в случае ошибки. Каждая попытка пишется
 * в телеметрию (ai_events): провайдер, модель, время, успех/ошибка, токены.
 */
/** Таймаут одного запроса провайдеру. Короткие задачи должны быстро переключаться дальше. */
const PROVIDER_TIMEOUT_MS: Record<AiTask, number> = {
  generation: 30_000,
  enhance: 20_000,
  tasks: 12_000,
  image: 30_000,
  vision: 15_000,
};

/** Общий бюджет времени на весь каскад фоллбэка (все провайдеры подряд). */
const FALLBACK_BUDGET_MS = 90_000;

/** Ниже этого остатка новый провайдер уже не запускается. */
const MIN_PROVIDER_BUDGET_MS = 8_000;

/**
 * Ошибка, после которой стоит перейти на другой ключ того же провайдера.
 *
 * Исчерпание лимита одной квоты не должно блокировать другой ключ того же
 * провайдера; при 429 перебираем все ключи, затем идём дальше по каскаду.
 */
function shouldTryNextKey(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  // 401/403 — ключ отозван или невалиден; 429 — исчерпан лимит.
  if (status === 401 || status === 403 || status === 429) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /exceeded your current quota|invalid api key|incorrect api key|quota|permission denied|unauthorized/i.test(
    message,
  );
}

export async function executeWithFallback<T>(
  task: AiTask,
  executeFn: (client: OpenAI, model: string, config: ProviderConfig) => Promise<T>
): Promise<T> {
  const configs = TASK_CONFIGS[task]().filter(configured);

  if (configs.length === 0) {
    throw new Error(`Нет настроенных API ключей для задачи «${task}»`);
  }

  let lastError: unknown = new Error("Неизвестная ошибка фоллбэка");

  // Общий дедлайн на каскад. Повтор SDK выключен, иначе его внутренняя
  // попытка могла превысить оставшееся время до перехода на следующий ключ.
  const deadline = Date.now() + FALLBACK_BUDGET_MS;

  for (const config of configs) {
    // Ключи провайдера: первый основной, остальные резервные. Перебор идёт
    // только по тем, кто подходит под ошибку выше, — иначе второй ключ
    // тратил бы время на заведомо непроходящий запрос.
    const keyList = config.apiKeys?.length ? config.apiKeys : [config.apiKey];

    for (const [keyIndex, apiKey] of keyList.entries()) {
      const remaining = deadline - Date.now();
      if (remaining <= MIN_PROVIDER_BUDGET_MS) {
        // Времени на следующий провайдер уже нет — не тратим запрос впустую.
        logAiEvent({
          task,
          provider: config.label,
          model: config.model,
          duration_ms: 0,
          ok: false,
          error: "budget_exhausted",
        });
        break;
      }
      const t0 = Date.now();
      try {
        const client = new OpenAI({
          apiKey,
          baseURL: config.baseURL,
          timeout: Math.min(PROVIDER_TIMEOUT_MS[task], remaining),
          maxRetries: 0,
        });
        // Ключ из обрыва ответа модели (`apiKey` в конфиге) — для промптов,
        // которые печатают ключ в текст ошибки.
        const withKey = apiKey === config.apiKey ? config : { ...config, apiKey };
        const result = await executeFn(client, config.model, withKey);
        logAiEvent({
          task,
          provider: config.label,
          model: config.model,
          duration_ms: Date.now() - t0,
          ok: true,
          error: null,
        });
        if (keyIndex > 0) {
          log.warn(
            `[AI Fallback] ${config.label} ответил только с ключа №${keyIndex + 1} — первый исчерпан.`,
            { task },
          );
        }
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const hasMoreKeys = keyIndex < keyList.length - 1;
        const tryNextKeyOnly = hasMoreKeys && shouldTryNextKey(err);

        log.warn(
          tryNextKeyOnly
            ? `[AI Fallback] ${config.label}, ключ ${keyIndex + 1}: ${message}. Пробуем запасной ключ…`
            : `[AI Fallback] ${config.label} не справился: ${message}. Пробуем следующего...`,
          { task, provider: config.label, key: keyIndex + 1 },
        );
        logAiEvent({
          task,
          provider: config.label,
          model: config.model,
          duration_ms: Date.now() - t0,
          ok: false,
          error: message.slice(0, 500),
        });
        lastError = err;

        // Ключи исчерпаны — переходим к следующему провайдеру каскада.
        if (!tryNextKeyOnly) break;
      }
    }
  }

  throw new Error(
    `Все AI провайдеры для «${task}» недоступны. Последняя ошибка: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}
