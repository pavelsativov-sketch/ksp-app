/**
 * Валидация переменных окружения — fail-fast.
 *
 * Вызывается из `src/instrumentation.ts` при старте сервера (включая dev),
 * чтобы конфигурационные ошибки ловились сразу, а не на первом запросе.
 */

type Severity = "required-prod" | "optional";

interface EnvSpec {
  key: string;
  severity: Severity;
  /** Минимальная длина значения (для секретов). */
  minLength?: number;
  description: string;
}

const SPECS: EnvSpec[] = [
  { key: "MONGODB_URI", severity: "required-prod", description: "Строка подключения к MongoDB" },
  { key: "MONGODB_DB", severity: "optional", description: "Имя базы (по умолчанию ksp)" },
  { key: "AUTH_SECRET", severity: "required-prod", minLength: 32, description: "Секрет подписи сессий (минимум 32 символа)" },
  { key: "RESEND_API_KEY", severity: "required-prod", description: "Отправка писем (восстановление пароля)" },
  { key: "MAIL_FROM", severity: "required-prod", description: "Адрес отправителя писем (верифицированный домен)" },
  { key: "APP_URL", severity: "required-prod", description: "Публичный URL — ссылки в письмах (https в проде)" },
  { key: "GROQ_API_KEY", severity: "optional", description: "AI-провайдер (см. src/lib/ai/providers.ts)" },
  { key: "GEMINI_API_KEY", severity: "optional", description: "AI-провайдер" },
  { key: "XAI_API_KEY", severity: "optional", description: "xAI Grok (допустимый алиас: GROK_API_KEY)" },
  { key: "GROK_API_KEY", severity: "optional", description: "xAI Grok (допустимый алиас: XAI_API_KEY)" },
  { key: "CEREBRAS_API_KEY", severity: "optional", description: "AI-провайдер" },
  { key: "OPENROUTER_API_KEY", severity: "optional", description: "AI-провайдер" },
  { key: "OPENAI_API_KEY", severity: "optional", description: "AI-провайдер и embeddings для RAG" },
  { key: "CLOUDFLARE_ACCOUNT_ID", severity: "optional", description: "Картинки (Workers AI)" },
  { key: "CLOUDFLARE_API_TOKEN", severity: "optional", description: "Картинки (Workers AI)" },
];

export interface EnvReport {
  ok: boolean;
  /** true — как минимум один AI-провайдер настроен. */
  aiConfigured: boolean;
  problems: string[];
}

export function validateEnv(env: NodeJS.ProcessEnv = process.env): EnvReport {
  const isProd = env.NODE_ENV === "production";
  const problems: string[] = [];

  for (const spec of SPECS) {
    const value = env[spec.key];
    const present = typeof value === "string" && value.trim().length > 0;
    if (!present) {
      if (spec.severity === "required-prod" && isProd) {
        problems.push(`MISSING: ${spec.key} — ${spec.description}`);
      }
      continue;
    }
    if (spec.minLength && value!.length < spec.minLength) {
      const msg = `WEAK: ${spec.key} — минимум ${spec.minLength} символов`;
      if (isProd) problems.push(msg);
      else console.warn(`[env] ${msg}`);
    }
  }

  const aiConfigured = [
    env.GROQ_API_KEY,
    env.GEMINI_API_KEY,
    env.XAI_API_KEY,
    env.GROK_API_KEY,
    env.CEREBRAS_API_KEY,
    env.OPENROUTER_API_KEY,
    env.OPENAI_API_KEY,
  ].some((value) => typeof value === "string" && value.split(",").some((key) => key.trim().length > 0));

  return { ok: problems.length === 0, aiConfigured, problems };
}
