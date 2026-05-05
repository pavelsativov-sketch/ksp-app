/**
 * Unified AI client for JSON-mode completions.
 *
 * Provider routing:
 *  - GEMINI_API_KEY set      → Gemini (default; faster + cheaper)
 *  - OPENAI_API_KEY set      → OpenAI (fallback)
 *  - neither                 → throws ProviderUnavailableError
 *
 * Both providers are accessed over plain fetch so this file works on
 * Cloudflare Workers, Node.js, and Edge runtimes without extra deps.
 */

export class ProviderUnavailableError extends Error {
  constructor() {
    super("No AI provider configured (GEMINI_API_KEY or OPENAI_API_KEY)");
    this.name = "ProviderUnavailableError";
  }
}

export type JsonSchema = Record<string, unknown>;

export interface CompleteJsonOptions {
  system: string;
  user: string;
  schema: JsonSchema;
  /** OpenAI-style schema name (used as label only, no functional effect on Gemini). */
  schemaName?: string;
  /** 0..1, default 0.7. */
  temperature?: number;
  /**
   * Override Gemini model for this call (e.g. `"gemini-2.5-flash-lite"` for
   * fast/cheap workloads). Falls back to `GEMINI_MODEL` env or `gemini-2.5-flash`.
   */
  geminiModel?: string;
  /**
   * Override OpenAI model for this call. Falls back to `OPENAI_MODEL` env or
   * `gpt-4o-mini`.
   */
  openaiModel?: string;
  /** Per-attempt timeout in ms. Default 60_000. */
  timeoutMs?: number;
  /** Number of retries on transient (5xx / 408 / 524 / abort) errors. Default 1. */
  maxRetries?: number;
}

export type AiProvider = "gemini" | "openai";

export function getActiveProvider(): AiProvider | null {
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

export function isAiConfigured(): boolean {
  return getActiveProvider() !== null;
}

/** Run a JSON-mode completion against the active provider and return the parsed object. */
export async function completeJson<T = unknown>(
  opts: CompleteJsonOptions,
): Promise<T> {
  const provider = getActiveProvider();
  if (!provider) throw new ProviderUnavailableError();
  return provider === "gemini"
    ? geminiCompleteJson<T>(opts)
    : openaiCompleteJson<T>(opts);
}

// ─── Gemini ───────────────────────────────────────────────────────────

/**
 * Gemini's responseSchema does not allow `additionalProperties` (the API
 * rejects the request). Strip it from any nested objects before sending.
 */
export function sanitizeForGemini(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeForGemini);
  if (schema && typeof schema === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
      if (k === "additionalProperties") continue;
      out[k] = sanitizeForGemini(v);
    }
    return out;
  }
  return schema;
}

/**
 * HTTP status codes (and our synthetic codes) that indicate a transient
 * upstream issue worth retrying once. 524 is Cloudflare's “origin timeout”
 * — we see it from Gemini’s edge when the model takes >100s on a complex
 * structured-output request.
 */
const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 524]);

export async function withRetry<T>(
  attempt: () => Promise<T>,
  maxRetries: number,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await attempt();
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      const transient =
        msg.includes("AbortError") ||
        msg.toLowerCase().includes("timeout") ||
        Array.from(TRANSIENT_STATUSES).some((s) => msg.includes(`${s}`));
      if (i === maxRetries || !transient) throw e;
      // brief backoff (300ms, 900ms, ...)
      await new Promise((r) => setTimeout(r, 300 * Math.pow(3, i)));
    }
  }
  throw lastErr;
}

async function geminiCompleteJson<T>(opts: CompleteJsonOptions): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY!;
  const model =
    opts.geminiModel ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: [{ role: "user", parts: [{ text: opts.user }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      responseMimeType: "application/json",
      responseSchema: sanitizeForGemini(opts.schema),
    },
  };
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const maxRetries = opts.maxRetries ?? 1;

  return withRetry(async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("");
    if (!raw) throw new Error("Gemini: empty response");
    return JSON.parse(raw) as T;
  }, maxRetries);
}

// ─── OpenAI ───────────────────────────────────────────────────────────

async function openaiCompleteJson<T>(opts: CompleteJsonOptions): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY!;
  const model = opts.openaiModel ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const maxRetries = opts.maxRetries ?? 1;

  return withRetry(async () => {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: opts.temperature ?? 0.7,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: opts.schemaName ?? "result",
            schema: opts.schema,
          },
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`OpenAI ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const raw = data.choices[0]?.message?.content;
    if (!raw) throw new Error("OpenAI: empty response");
    return JSON.parse(raw) as T;
  }, maxRetries);
}
