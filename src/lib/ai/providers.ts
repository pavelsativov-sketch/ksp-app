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

export type AiTask = "generation" | "enhance" | "tasks" | "vision";

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
  /**
   * Дополнительные поля тела запроса у этого провайдера. Mercury 3 по умолчанию
   * рассуждает и тратил на это 6–8 тыс. из 8192 токенов ответа: презентация и
   * рабочий лист обрывались (finish: length). С reasoning_effort "instant" те же
   * 19 слайдов приходят за 4 с.
   */
  extraBody?: Record<string, unknown>;
}

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/";
const GROQ_BASE = "https://api.groq.com/openai/v1";
const CEREBRAS_BASE = "https://api.cerebras.ai/v1";
const MXR_BASE = "https://mxr.one/v1";
const MERCURY_BASE = "https://api.inceptionlabs.ai/v1";
const KENARI_BASE = "https://kenari.id/v1";
/** Mercury без рассуждений: весь бюджет ответа уходит на сам ответ (см. extraBody). */
const MERCURY_FAST = { reasoning_effort: "instant" };
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const OPENAI_BASE = "https://api.openai.com/v1";
const XAI_BASE = "https://api.x.ai/v1";
const APINEX_BASE = "https://api.apinex.bond/v1";

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

/**
 * AI_DISABLE_FREE_PROVIDERS=1 (или true) убирает из всех каскадов бесплатные
 * сторонние шлюзы — Apinex, MXR, Kenari (и Pollinations в картинках): они
 * перепродают чужие модели, без гарантий по данным и доступности. Официальные
 * API (Mercury, Groq, Cerebras, Gemini, xAI, OpenAI, OpenRouter) остаются.
 * По умолчанию выключено.
 */
export function freeProvidersDisabled(): boolean {
  return /^(1|true)$/i.test(process.env.AI_DISABLE_FREE_PROVIDERS ?? "");
}

function freeGatewayKeys(raw: string | undefined): string[] {
  return freeProvidersDisabled() ? [] : parseApiKeys(raw);
}

const keys = {
  openai: () => parseApiKeys(process.env.OPENAI_API_KEY),
  xai: () => parseApiKeys(process.env.XAI_API_KEY || process.env.GROK_API_KEY),
  gemini: () => parseApiKeys(process.env.GEMINI_API_KEY),
  groq: () => parseApiKeys(process.env.GROQ_API_KEY),
  cerebras: () => parseApiKeys(process.env.CEREBRAS_API_KEY),
  mxr: () => freeGatewayKeys(process.env.MXR_API_KEY),
  mercury: () => parseApiKeys(process.env.MERCURY_API_KEY),
  kenari: () => freeGatewayKeys(process.env.KENARI_API_KEY),
  openrouter: () => parseApiKeys(process.env.OPENROUTER_API_KEY),
  apinex: () => freeGatewayKeys(process.env.APINEX_API_KEY || process.env.APINEX_KEY),
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
export const TASK_CONFIGS: Record<AiTask, () => ProviderConfig[]> = {
  generation: () => [
    // Mercury первым: КСП — длинный JSON, а Mercury пишет его за секунды (см. tasks).
    withKeys({ apiKeys: keys.mercury(), baseURL: MERCURY_BASE, model: "mercury-3", supportsJsonSchema: false, label: "Inception Mercury 3 (KSP Primary)", temperature: 0.4, maxTokens: 8192, extraBody: MERCURY_FAST }),
    withKeys({ apiKeys: keys.mxr(), baseURL: MXR_BASE, model: "gpt-6.1-terra", supportsJsonSchema: false, label: "MXR GPT 6.1 Terra (KSP Fallback 1)", temperature: 0.5, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.mxr(), baseURL: MXR_BASE, model: "gpt-6-luna", supportsJsonSchema: false, label: "MXR GPT 6 Luna (KSP Fallback 2)", temperature: 0.5, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.kenari(), baseURL: KENARI_BASE, model: "nemotron-3-ultra-550b-a55b:free", supportsJsonSchema: false, label: "Kenari Nemotron 3 Ultra (KSP Fallback 3)", temperature: 0.5, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.groq(), baseURL: GROQ_BASE, model: "openai/gpt-oss-120b", supportsJsonSchema: false, label: "Groq GPT OSS 120B (Fallback 4)", temperature: 0.7, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.groq(), baseURL: GROQ_BASE, model: "qwen/qwen3.8-27b", supportsJsonSchema: false, label: "Groq Qwen 3.8 27B (Fallback 4b)", temperature: 0.5, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.apinex(), baseURL: APINEX_BASE, model: "free/kimi-k3", supportsJsonSchema: false, label: "Apinex Kimi K3 (Fallback)", temperature: 0.4, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.apinex(), baseURL: APINEX_BASE, model: "free/glm-5.3", supportsJsonSchema: false, label: "Apinex GLM 5.3 (Fallback)", temperature: 0.5, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.apinex(), baseURL: APINEX_BASE, model: "free/gpt-6-luna", supportsJsonSchema: false, label: "Apinex GPT 6 Luna (Fallback)", temperature: 0.5, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.gemini(), baseURL: GEMINI_BASE, model: "gemini-3.8-flash", supportsJsonSchema: false, label: "Gemini 3.8 Flash (Fallback 5)", temperature: 0.7, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.xai(), baseURL: XAI_BASE, model: "grok-4.7", supportsJsonSchema: false, label: "xAI Grok 4.7 (Fallback 6)", temperature: 0.7, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.openai(), baseURL: OPENAI_BASE, model: "gpt-4o", supportsJsonSchema: true, label: "OpenAI GPT-4o (Fallback 7)", temperature: 0.7, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.cerebras(), baseURL: CEREBRAS_BASE, model: "gpt-oss-120b", supportsJsonSchema: true, label: "Cerebras GPT OSS 120B (Fallback 8)", temperature: 0.7, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.openrouter(), baseURL: OPENROUTER_BASE, model: "nex-agi/nex-n2.5-pro", supportsJsonSchema: false, label: "OpenRouter Nex 2.5 Pro (Free Emergency Fallback)", temperature: 0.7, maxTokens: 8192 }),
  ],
  enhance: () => [
    // Живые и быстрые провайдеры первыми: Mercury (~1.6 с), MXR, Kenari, Groq.
    withKeys({ apiKeys: keys.mercury(), baseURL: MERCURY_BASE, model: "mercury-3", supportsJsonSchema: false, label: "Inception Mercury 3 (Primary)", temperature: 0.3, maxTokens: 8192, extraBody: MERCURY_FAST }),
    withKeys({ apiKeys: keys.mxr(), baseURL: MXR_BASE, model: "gpt-6.1-terra", supportsJsonSchema: false, label: "MXR GPT 6.1 Terra (Fallback 1)", temperature: 0.3, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.mxr(), baseURL: MXR_BASE, model: "gpt-6-luna", supportsJsonSchema: false, label: "MXR GPT 6 Luna (Fallback 2)", temperature: 0.4, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.kenari(), baseURL: KENARI_BASE, model: "nemotron-3-ultra-550b-a55b:free", supportsJsonSchema: false, label: "Kenari Nemotron 3 Ultra (Fallback 3)", temperature: 0.4, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.groq(), baseURL: GROQ_BASE, model: "openai/gpt-oss-120b", supportsJsonSchema: true, label: "Groq GPT OSS 120B (Fallback 4)", temperature: 0.5, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.groq(), baseURL: GROQ_BASE, model: "qwen/qwen3.8-27b", supportsJsonSchema: false, label: "Groq Qwen 3.8 27B (Fallback 4b)", temperature: 0.4, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.apinex(), baseURL: APINEX_BASE, model: "free/kimi-k3", supportsJsonSchema: false, label: "Apinex Kimi K3 (Fallback)", temperature: 0.3, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.apinex(), baseURL: APINEX_BASE, model: "free/glm-5.3", supportsJsonSchema: false, label: "Apinex GLM 5.3 (Fallback)", temperature: 0.4, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.apinex(), baseURL: APINEX_BASE, model: "free/gpt-6-luna", supportsJsonSchema: false, label: "Apinex GPT 6 Luna (Fallback)", temperature: 0.4, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.gemini(), baseURL: GEMINI_BASE, model: "gemini-3.8-flash", supportsJsonSchema: false, label: "Gemini 3.8 Flash (Fallback 5)", temperature: 0.5, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.xai(), baseURL: XAI_BASE, model: "grok-4.7", supportsJsonSchema: false, label: "xAI Grok 4.7 (Fallback 6)", temperature: 0.5, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.openai(), baseURL: OPENAI_BASE, model: "gpt-4o-mini", supportsJsonSchema: true, label: "OpenAI GPT-4o-mini (Fallback 7)", temperature: 0.5, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.cerebras(), baseURL: CEREBRAS_BASE, model: "gpt-oss-120b", supportsJsonSchema: true, label: "Cerebras GPT OSS 120B (Fallback 8)", temperature: 0.5, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.openrouter(), baseURL: OPENROUTER_BASE, model: "nex-agi/nex-n2.5-pro", supportsJsonSchema: false, label: "OpenRouter Nex 2.5 Pro (Free Emergency Fallback)", temperature: 0.5, maxTokens: 8192 }),
  ],
  tasks: () => [
    // Без минутного лимита бесплатного Groq (8000 токенов). Замер 2026-11-16: Mercury
    // пишет ~470 токенов/с и вызывает инструменты за 0,9 с, MXR — ~50 токенов/с, поэтому
    // длинный рабочий лист у MXR упирался в таймаут 45 с. Без ключей пропускаются.
    withKeys({ apiKeys: keys.mercury(), baseURL: MERCURY_BASE, model: "mercury-3", supportsJsonSchema: false, label: "Inception Mercury 3 (Primary)", temperature: 0.2, maxTokens: 8192, extraBody: MERCURY_FAST }),
    withKeys({ apiKeys: keys.mxr(), baseURL: MXR_BASE, model: "gpt-6.1-terra", supportsJsonSchema: false, label: "MXR GPT 6.1 Terra (Agent Primary)", temperature: 0.2, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.mxr(), baseURL: MXR_BASE, model: "gpt-6-luna", supportsJsonSchema: false, label: "MXR GPT 6 Luna (Agent Fallback)", temperature: 0.2, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.kenari(), baseURL: KENARI_BASE, model: "nemotron-3-ultra-550b-a55b:free", supportsJsonSchema: false, label: "Kenari Nemotron 3 Ultra (Fallback)", temperature: 0.2, maxTokens: 8192 }),
    // Apinex — первичный маршрут для инструментов агента и заданий.
    withKeys({ apiKeys: keys.apinex(), baseURL: APINEX_BASE, model: "free/kimi-k3", supportsJsonSchema: false, label: "Apinex Kimi K3 (Primary)", temperature: 0.2, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.apinex(), baseURL: APINEX_BASE, model: "free/glm-5.3", supportsJsonSchema: false, label: "Apinex GLM 5.3 (Fallback 1)", temperature: 0.2, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.apinex(), baseURL: APINEX_BASE, model: "free/gpt-6-luna", supportsJsonSchema: false, label: "Apinex GPT 6 Luna (Fallback 2)", temperature: 0.3, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.groq(), baseURL: GROQ_BASE, model: "openai/gpt-oss-120b", supportsJsonSchema: false, label: "Groq GPT OSS 120B (Fallback 3)", temperature: 0.2, maxTokens: 8192 }),
    // У Qwen на Groq свой минутный лимит токенов: агент не встаёт, когда GPT OSS исчерпал свой.
    withKeys({ apiKeys: keys.groq(), baseURL: GROQ_BASE, model: "qwen/qwen3.8-27b", supportsJsonSchema: false, label: "Groq Qwen 3.8 27B (Fallback 3b)", temperature: 0.2, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.gemini(), baseURL: GEMINI_BASE, model: "gemini-3.8-flash", supportsJsonSchema: false, label: "Gemini 3.8 Flash (Fallback 4)", temperature: 0.2, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.xai(), baseURL: XAI_BASE, model: "grok-4.7", supportsJsonSchema: false, label: "xAI Grok 4.7 (Fallback 5)", temperature: 0.7, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.groq(), baseURL: GROQ_BASE, model: "openai/gpt-oss-20b", supportsJsonSchema: true, label: "Groq GPT OSS 20B (Fallback 6)", temperature: 0.7, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.openai(), baseURL: OPENAI_BASE, model: "gpt-4o-mini", supportsJsonSchema: true, label: "OpenAI GPT-4o-mini (Fallback 7)", temperature: 0.7, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.cerebras(), baseURL: CEREBRAS_BASE, model: "gpt-oss-120b", supportsJsonSchema: true, label: "Cerebras GPT OSS 120B (Fallback 8)", temperature: 0.7, maxTokens: 8192 }),
    withKeys({ apiKeys: keys.openrouter(), baseURL: OPENROUTER_BASE, model: "nex-agi/nex-n2.5-mini", supportsJsonSchema: false, label: "OpenRouter Nex Mini (Free Emergency Fallback)", temperature: 0.7, maxTokens: 8192 }),
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
    // MXR — проверено вживую: принимает image_url и стабильно возвращает tool_calls с координатами.
    withKeys({ apiKeys: keys.mxr(), baseURL: MXR_BASE, model: "gpt-6-luna", supportsJsonSchema: false, label: "MXR GPT 6 Luna Vision (Fallback 1)", temperature: 0.1, maxTokens: 1024 }),
    withKeys({ apiKeys: keys.mxr(), baseURL: MXR_BASE, model: "gpt-6.1-terra", supportsJsonSchema: false, label: "MXR GPT 6.1 Terra Vision (Fallback 2)", temperature: 0.1, maxTokens: 1024 }),
    // Gemini — резерв, если Groq и MXR недоступны.
    withKeys({ apiKeys: keys.gemini(), baseURL: GEMINI_BASE, model: "gemini-3.8-flash", supportsJsonSchema: false, label: "Gemini 3.8 Flash Vision (Fallback 3)", temperature: 0.1, maxTokens: 2048 }),
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
      keys.mxr().length ||
      keys.mercury().length ||
      keys.kenari().length ||
      keys.apinex().length ||
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
  generation: 22_000,
  enhance: 18_000,
  tasks: 12_000,
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
/**
 * Через сколько миллисекунд провайдер просит повторить запрос после минутного
 * лимита («try again in 42.3s»). null — ошибка не про лимит или времени нет.
 */
export function rateLimitRetryMs(err: unknown): number | null {
  const value = (err as { retryAfterMs?: unknown } | null)?.retryAfterMs;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseRetryAfterMs(message: string): number | null {
  const match = message.match(/try again in (?:(\d+)m)?([\d.]+)(ms|s)/i);
  if (!match) return null;
  const amount = Number(match[2]) * (match[3] === "ms" ? 1 : 1000);
  return Math.ceil(Number(match[1] ?? 0) * 60_000 + amount);
}

function shouldTryNextKey(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  // 401/402/403 — ключ отозван, без баланса или невалиден; 429/503 — лимит или перегрузка.
  if (status === 401 || status === 402 || status === 403 || status === 429 || status === 503) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /exceeded your current quota|invalid api key|incorrect api key|quota|permission denied|unauthorized|high demand/i.test(
    message,
  );
}

function isHostTimeoutOrStall(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status === 408 || status === 502 || status === 504) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /timed?\s*out|timeout|econnreset|etimedout|enotfound|socket hang up|bad gateway|gateway time-?out/i.test(
    message,
  );
}

const COOLDOWN_TIMEOUT_MS = 45_000;
const COOLDOWN_AUTH_MS = 120_000;
const providerCooldownUntil = new Map<string, number>();

function isAuthOrBillingFailure(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status === 401 || status === 402 || status === 403) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /insufficient.?quota|billing|payment|unauthorized|invalid.?api.?key|\b40[123]\b/i.test(message);
}

function isProviderInCooldown(config: ProviderConfig, now: number): boolean {
  return (
    (providerCooldownUntil.get(config.baseURL) ?? 0) > now ||
    (providerCooldownUntil.get(`${config.baseURL}|${config.label}`) ?? 0) > now
  );
}

export interface FallbackOptions {
  /** Общий бюджет на весь каскад (по умолчанию FALLBACK_BUDGET_MS). */
  budgetMs?: number;
  /** Таймаут одного запроса, если задача длиннее обычной для своего типа. */
  timeoutMs?: number;
  /** Внешний сигнал отмены: прерывает текущий запрос к провайдеру. */
  signal?: AbortSignal;
}

export async function executeWithFallback<T>(
  task: AiTask,
  executeFn: (client: OpenAI, model: string, config: ProviderConfig, signal?: AbortSignal) => Promise<T>,
  opts: FallbackOptions = {},
): Promise<T> {
  const configs = TASK_CONFIGS[task]().filter(configured);

  if (configs.length === 0) {
    throw new Error(`Нет настроенных API ключей для задачи «${task}»`);
  }

  let lastError: unknown = new Error("Неизвестная ошибка фоллбэка");
  const useCooldown = !process.env.VITEST && process.env.NODE_ENV !== "test";

  // Общий дедлайн на каскад. Повтор SDK выключен, иначе его внутренняя
  // попытка могла превысить оставшееся время до перехода на следующий ключ.
  const deadline = Date.now() + (opts.budgetMs ?? FALLBACK_BUDGET_MS);
  const abortOnExternal = new AbortController();
  const onAbort = () => abortOnExternal.abort();
  if (opts.signal) {
    if (opts.signal.aborted) abortOnExternal.abort();
    else opts.signal.addEventListener("abort", onAbort, { once: true });
  }

  let soonestRetryMs: number | null = null;
  const timedOutHosts = new Set<string>();
  for (let cfgIdx = 0; cfgIdx < configs.length; cfgIdx++) {
    const config = configs[cfgIdx]!;
    const now = Date.now();
    // Если этот хост (например mxr.one или apinex) только что завис по таймауту
    // или недавно вернул системную/авторизационную ошибку — пропускаем, пока есть живые альтернативы.
    const hostTimedOutThisCall =
      timedOutHosts.has(config.baseURL) &&
      configs.slice(cfgIdx + 1).some((c) => !timedOutHosts.has(c.baseURL));
    const cooledAcrossRequests =
      useCooldown &&
      isProviderInCooldown(config, now) &&
      configs.some((c) => !isProviderInCooldown(c, now) && !timedOutHosts.has(c.baseURL));
    if (hostTimedOutThisCall || cooledAcrossRequests) {
      continue;
    }
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
        const signal = opts.signal ? abortOnExternal.signal : undefined;
        const client = new OpenAI({
          apiKey,
          baseURL: config.baseURL,
          timeout: Math.min(opts.timeoutMs ?? PROVIDER_TIMEOUT_MS[task], remaining),
          maxRetries: 0,
        });
        if (config.extraBody) {
          // Поля провайдера добавляются ко всем запросам: вызывающий код о них не знает.
          const create = client.chat.completions.create.bind(client.chat.completions);
          client.chat.completions.create = ((body: Record<string, unknown>, options?: unknown) =>
            create({ ...body, ...config.extraBody } as never, options as never)) as unknown as typeof client.chat.completions.create;
        }
        // Ключ из обрыва ответа модели (`apiKey` в конфиге) — для промптов,
        // которые печатают ключ в текст ошибки.
        const withKey = apiKey === config.apiKey ? config : { ...config, apiKey };
        const result = await executeFn(client, config.model, withKey, signal);
        providerCooldownUntil.delete(config.baseURL);
        providerCooldownUntil.delete(`${config.baseURL}|${config.label}`);
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
        if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
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
        const retryMs = parseRetryAfterMs(message);
        if (retryMs !== null) soonestRetryMs = Math.min(soonestRetryMs ?? retryMs, retryMs);

        if (!opts.signal?.aborted && isHostTimeoutOrStall(err)) {
          timedOutHosts.add(config.baseURL);
          if (useCooldown) providerCooldownUntil.set(config.baseURL, Date.now() + COOLDOWN_TIMEOUT_MS);
          break;
        }

        // Ключи исчерпаны — переходим к следующему провайдеру каскада.
        if (!tryNextKeyOnly) {
          if (useCooldown && !opts.signal?.aborted && isAuthOrBillingFailure(err)) {
            providerCooldownUntil.set(`${config.baseURL}|${config.label}`, Date.now() + COOLDOWN_AUTH_MS);
          }
          break;
        }
      }
    }
  }

  if (opts.signal) opts.signal.removeEventListener("abort", onAbort);

  const failure = new Error(
    `Все AI провайдеры для «${task}» недоступны. Последняя ошибка: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
  // Хоть один провайдер упёрся лишь в минутный лимит: вызывающий может подождать и повторить.
  if (soonestRetryMs !== null) Object.assign(failure, { retryAfterMs: soonestRetryMs });
  throw failure;
}
