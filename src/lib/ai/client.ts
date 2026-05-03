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
function sanitizeForGemini(schema: unknown): unknown {
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

async function geminiCompleteJson<T>(opts: CompleteJsonOptions): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY!;
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
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

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
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
}

// ─── OpenAI ───────────────────────────────────────────────────────────

async function openaiCompleteJson<T>(opts: CompleteJsonOptions): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY!;
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

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
}
