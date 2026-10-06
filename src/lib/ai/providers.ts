/**
 * Центральный конфиг AI-провайдеров с поддержкой умного фоллбэка.
 *
 * Каждая задача платформы имеет список предпочитаемых моделей.
 * Платформа пробует первую модель, и при ошибке (лимиты, баланс, недоступность)
 * автоматически переключается на следующую.
 *
 * Приоритеты моделей:
 * 1. OpenAI (GPT-4o, GPT-4o-mini) — лучшее качество, если есть ключ
 * 2. Anthropic Claude — отличное качество для текста и структурированного вывода
 * 3. Groq (GPT OSS 120B, Qwen) — быстрые бесплатные модели
 * 4. Gemini — хорошее качество, бесплатный тир
 * 5. Cerebras — быстрые бесплатные модели
 * 6. OpenRouter — последний резерв с бесплатными моделями
 */

import OpenAI from "openai";
import { logAiEvent } from "./telemetry";
import { log } from "@/lib/logger";

export type AiTask = "generation" | "enhance" | "tasks" | "image";

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
}

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/";
const GROQ_BASE = "https://api.groq.com/openai/v1";
const CEREBRAS_BASE = "https://api.cerebras.ai/v1";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const OPENAI_BASE = "https://api.openai.com/v1";
const ANTHROPIC_BASE = "https://api.anthropic.com/v1";

const keys = {
  openai: () => process.env.OPENAI_API_KEY || "",
  anthropic: () => process.env.ANTHROPIC_API_KEY || "",
  gemini: () => process.env.GEMINI_API_KEY || "",
  groq: () => process.env.GROQ_API_KEY || "",
  cerebras: () => process.env.CEREBRAS_API_KEY || "",
  openrouter: () => process.env.OPENROUTER_API_KEY || "",
};

// ── Массивы провайдеров (от лучшего к запасному) ────────────────

/**
 * Реальная проверка ключей (2026-10-05), determines живой каскад:
 *   Gemini  — 200, единственный надёжный провайдер;
 *   Groq    — 200, но у организации жёсткие лимиты: TPM 8000 и OTPM 1000.
 *             При maxTokens 8192 Groq отвечает 429 (OTPM) и 413 (TPM) на
 *             каждом запросе, поэтому для Groq лимит задан 1024/1536.
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
    // Gemini — единственный провайдер, который стабильно отвечает сейчас.
    { apiKey: keys.gemini(), baseURL: GEMINI_BASE, model: "gemini-3.8-flash", supportsJsonSchema: false, label: "Gemini 3.8 Flash (Primary)", temperature: 0.7, maxTokens: 8192 },
    // Groq GPT OSS 120B — быстрый резерв; maxTokens урезан до лимита OTPM.
    { apiKey: keys.groq(), baseURL: GROQ_BASE, model: "openai/gpt-oss-120b", supportsJsonSchema: true, label: "Groq GPT OSS 120B (Fallback 1)", temperature: 0.7, maxTokens: 1536 },
    // OpenAI GPT-4o — лучшее качество, если ключ будет валидным.
    { apiKey: keys.openai(), baseURL: OPENAI_BASE, model: "gpt-4o", supportsJsonSchema: true, label: "OpenAI GPT-4o (Fallback 2)", temperature: 0.7, maxTokens: 8192 },
    // Cerebras — быстрая бесплатная модель
    { apiKey: keys.cerebras(), baseURL: CEREBRAS_BASE, model: "gpt-oss-120b", supportsJsonSchema: true, label: "Cerebras GPT OSS 120B (Fallback 3)", temperature: 0.7, maxTokens: 8192 },
    // OpenRouter — последний резерв
    { apiKey: keys.openrouter(), baseURL: OPENROUTER_BASE, model: "nex-agi/nex-n2.5-pro:free", supportsJsonSchema: false, label: "OpenRouter Nex 2.5 Pro (Free Emergency Fallback)", temperature: 0.7, maxTokens: 8192 },
  ],
  enhance: () => [
    // Gemini — основной маршрут: улучшение секций короткое, ответ быстрый.
    { apiKey: keys.gemini(), baseURL: GEMINI_BASE, model: "gemini-3.8-flash", supportsJsonSchema: false, label: "Gemini 3.8 Flash (Primary)", temperature: 0.5, maxTokens: 8192 },
    // Groq — резерв с урезанным maxTokens под OTPM 1000.
    { apiKey: keys.groq(), baseURL: GROQ_BASE, model: "openai/gpt-oss-120b", supportsJsonSchema: true, label: "Groq GPT OSS 120B (Fallback 1)", temperature: 0.5, maxTokens: 1536 },
    // OpenAI GPT-4o-mini — быстрая и качественная для редактирования
    { apiKey: keys.openai(), baseURL: OPENAI_BASE, model: "gpt-4o-mini", supportsJsonSchema: true, label: "OpenAI GPT-4o-mini (Fallback 2)", temperature: 0.5, maxTokens: 8192 },
    // Cerebras
    { apiKey: keys.cerebras(), baseURL: CEREBRAS_BASE, model: "gpt-oss-120b", supportsJsonSchema: true, label: "Cerebras GPT OSS 120B (Fallback 3)", temperature: 0.5, maxTokens: 8192 },
    // OpenRouter
    { apiKey: keys.openrouter(), baseURL: OPENROUTER_BASE, model: "nex-agi/nex-n2.5-pro:free", supportsJsonSchema: false, label: "OpenRouter Nex 2.5 Pro (Free Emergency Fallback)", temperature: 0.5, maxTokens: 8192 },
  ],
  tasks: () => [
    // Gemini — отвечает и не требует strict-схемы.
    { apiKey: keys.gemini(), baseURL: GEMINI_BASE, model: "gemini-3.8-flash", supportsJsonSchema: false, label: "Gemini 3.8 Flash (Primary)", temperature: 0.7, maxTokens: 8192 },
    // Groq GPT OSS 120B — держит strict-схему, maxTokens урезан под OTPM.
    { apiKey: keys.groq(), baseURL: GROQ_BASE, model: "openai/gpt-oss-120b", supportsJsonSchema: true, label: "Groq GPT OSS 120B (Fallback 1)", temperature: 0.7, maxTokens: 1536 },
    // Groq GPT OSS 20B — быстрый резерв.
    { apiKey: keys.groq(), baseURL: GROQ_BASE, model: "openai/gpt-oss-20b", supportsJsonSchema: true, label: "Groq GPT OSS 20B (Fallback 2)", temperature: 0.7, maxTokens: 1536 },
    // OpenAI GPT-4o-mini — лучший структурированный JSON, если ключ рабочий.
    { apiKey: keys.openai(), baseURL: OPENAI_BASE, model: "gpt-4o-mini", supportsJsonSchema: true, label: "OpenAI GPT-4o-mini (Fallback 3)", temperature: 0.7, maxTokens: 8192 },
    // Cerebras
    { apiKey: keys.cerebras(), baseURL: CEREBRAS_BASE, model: "gpt-oss-120b", supportsJsonSchema: true, label: "Cerebras GPT OSS 120B (Fallback 4)", temperature: 0.7, maxTokens: 8192 },
    // OpenRouter. Слаг :free у nex-agi отозван (404), поэтому берём pro без
    // суффикса — он остаётся в каскаде последним аварийным маршрутом.
    { apiKey: keys.openrouter(), baseURL: OPENROUTER_BASE, model: "nex-agi/nex-n2.5-mini", supportsJsonSchema: false, label: "OpenRouter Nex Mini (Free Emergency Fallback)", temperature: 0.7, maxTokens: 8192 },
  ],
  image: () => [
    // Gemini 3.8 Flash — основная модель генерации изображений (яркие цвета).
    { apiKey: keys.gemini(), baseURL: "https://generativelanguage.googleapis.com/v1beta/", model: "gemini-3.8-flash", supportsJsonSchema: false, label: "Gemini 3.8 Flash (Primary Image)", temperature: 1.0, maxTokens: 8192 },
    // OpenAI DALL-E 3 — fallback для генерации изображений
    { apiKey: keys.openai(), baseURL: OPENAI_BASE, model: "dall-e-3", supportsJsonSchema: false, label: "OpenAI DALL-E 3 (Fallback Image)", temperature: 0.7, maxTokens: 4096 },
  ],
};

export type AiResponseFormat =
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: { name: string; schema: Record<string, unknown>; strict: boolean } }
  | undefined;

export function isAnyProviderConfigured(): boolean {
  return Boolean(
    keys.openai() ||
      keys.anthropic() ||
      keys.gemini() ||
      keys.groq() ||
      keys.cerebras() ||
      keys.openrouter() ||
      (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN),
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
/** Таймаут одного провайдера. */
const PROVIDER_TIMEOUT_MS = 35_000;

/** Общий бюджет времени на весь каскад фоллбэка (все провайдеры подряд). */
const FALLBACK_BUDGET_MS = 90_000;

/** Ниже этого остатка новый провайдер уже не запускается. */
const MIN_PROVIDER_BUDGET_MS = 8_000;

/** Задержка перед повтором временно упавшего провайдера. */
const TRANSIENT_RETRY_DELAY_MS = 4_000;

/**
 * Временные сбои, после которых повтор на том же провайере осмыслен.
 *
 * Раньше 503 от Gemini (лимит запросов) и 429 от Groq (OTPM) немедленно
 * перебрасывали каскад на следующего провайдера, хотя через несколько
 * секунд тот же запрос проходил. Из-за этого рабочий лист падал с 500,
 * хотя единственный живой провайдер был просто временно перегружен.
 */
function isTransientError(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status === 429 || status === 503 || status === 502 || status === 504) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /\b(429|500|502|503|504)\b|rate limit|too many requests|overloaded|timeout|ECONNRESET|fetch failed/i.test(
    message,
  );
}

async function executeWithTransientRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isTransientError(err)) throw err;
    logAiEvent({ task: "retry", provider: "transient", model: "-", duration_ms: 0, ok: false, error: "retry_after_backoff" });
    await new Promise((resolve) => setTimeout(resolve, TRANSIENT_RETRY_DELAY_MS));
    return await fn();
  }
}

export async function executeWithFallback<T>(
  task: AiTask,
  executeFn: (client: OpenAI, model: string, config: ProviderConfig) => Promise<T>
): Promise<T> {
  const configs = TASK_CONFIGS[task]().filter(c => Boolean(c.apiKey));

  if (configs.length === 0) {
    throw new Error(`Нет настроенных API ключей для задачи «${task}»`);
  }

  let lastError: unknown = new Error("Неизвестная ошибка фоллбэка");

  // Общий дедлайн на ВЕСЬ каскад. Раньше лимит был только на провайдера
  // (35 c × 1 ретрай × до 5 провайдеров = до 175 c), из-за чего прокси и
  // Cloudflare убивали запрос, а учитель видел 500 без причины.
  const deadline = Date.now() + FALLBACK_BUDGET_MS;

  for (const config of configs) {
    const remaining = deadline - Date.now();
    if (remaining <= MIN_PROVIDER_BUDGET_MS) {
      // Времени на следующего провайдера уже нет — не тратим запрос впустую.
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
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        timeout: Math.min(PROVIDER_TIMEOUT_MS, remaining),
        maxRetries: 1,
      });
      const result = await executeWithTransientRetry(() => executeFn(client, config.model, config));
      logAiEvent({
        task,
        provider: config.label,
        model: config.model,
        duration_ms: Date.now() - t0,
        ok: true,
        error: null,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`[AI Fallback] ${config.label} не справился: ${message}. Пробуем следующего...`, {
        task, provider: config.label,
      });
      logAiEvent({
        task,
        provider: config.label,
        model: config.model,
        duration_ms: Date.now() - t0,
        ok: false,
        error: message.slice(0, 500),
      });
      lastError = err;
    }
  }

  throw new Error(
    `Все AI провайдеры для «${task}» недоступны. Последняя ошибка: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}
