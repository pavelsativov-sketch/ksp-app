import OpenAI from "openai";
import { parseApiKeys } from "@/lib/ai/providers";
import { getCachedEmbedding, setCachedEmbedding } from "./cache";

const OPENAI_MODEL = "text-embedding-3-small";
// Бесплатная альтернатива: многоязычная модель Cloudflare (RU/KK понимает, 1024 dim).
const CF_MODEL = "@cf/baai/bge-m3";
// Резерв 1: Gemini Embedding (1024 dim при outputDimensionality=1024).
const GEMINI_EMBED_MODEL = "gemini-embedding-001";
// Резерв 2: Voyage AI.
const VOYAGE_MODEL = "voyage-3-lite";

export type EmbeddingProvider = "openai" | "cloudflare" | "gemini" | "voyage" | "none";

export interface EmbeddingResult {
  vectors: Array<number[] | null>; // null — embeddings недоступны (нет ключа)
  totalTokens: number;
  /** Какой провайдер посчитал векторы. */
  provider: EmbeddingProvider;
}

interface ProviderAttempt {
  provider: Exclude<EmbeddingProvider, "none">;
  model: string;
  run: (texts: string[]) => Promise<Omit<EmbeddingResult, "provider">>;
}

function configuredProviders(): ProviderAttempt[] {
  const list: ProviderAttempt[] = [];
  const openaiKeys = parseApiKeys(process.env.OPENAI_API_KEY);
  if (openaiKeys.length > 0) {
    list.push({
      provider: "openai",
      model: OPENAI_MODEL,
      run: (texts) => embedOpenAi(texts, openaiKeys),
    });
  }
  if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) {
    list.push({
      provider: "cloudflare",
      model: CF_MODEL,
      run: (texts) => embedCloudflare(texts),
    });
  }
  const geminiKeys = parseApiKeys(process.env.GEMINI_API_KEY);
  if (geminiKeys.length > 0) {
    list.push({
      provider: "gemini",
      model: GEMINI_EMBED_MODEL,
      run: (texts) => embedGemini(texts, geminiKeys),
    });
  }
  const voyageKeys = parseApiKeys(process.env.VOYAGE_API_KEY);
  if (voyageKeys.length > 0) {
    list.push({
      provider: "voyage",
      model: VOYAGE_MODEL,
      run: (texts) => embedVoyage(texts, voyageKeys[0]!),
    });
  }
  return list;
}

export async function embedTexts(inputs: string[]): Promise<EmbeddingResult> {
  if (inputs.length === 0) return { vectors: [], totalTokens: 0, provider: "none" };
  const providers = configuredProviders();
  if (providers.length === 0) {
    return { vectors: inputs.map(() => null), totalTokens: 0, provider: "none" };
  }

  let lastError: unknown = new Error("Embedding providers unavailable");
  for (const candidate of providers) {
    try {
      const res = await embedWithCache(inputs, candidate.model, candidate.run);
      return { ...res, provider: candidate.provider };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * Кэшированный путь: сначала ищем в LRU-кэше, в провайдер идём только
 * с теми текстами, которых в кэше нет. Ключ — хеш текста + модели, поэтому
 * смена провайдера не даёт чужих векторов.
 */
async function embedWithCache(
  inputs: string[],
  model: string,
  runner: (texts: string[]) => Promise<Omit<EmbeddingResult, "provider">>,
): Promise<Omit<EmbeddingResult, "provider">> {
  const cached = inputs.map((text) => getCachedEmbedding(text, model));
  const missing: Array<{ index: number; text: string }> = [];
  cached.forEach((vector, index) => {
    if (vector === undefined) missing.push({ index, text: inputs[index]! });
  });
  if (missing.length === 0) {
    return { vectors: cached as Array<number[] | null>, totalTokens: 0 };
  }
  const fetched = missing.map((m) => m.text);
  const result = await runner(fetched);
  missing.forEach((m, i) => {
    const vector = result.vectors[i] ?? null;
    cached[m.index] = vector;
    setCachedEmbedding(m.text, model, vector);
  });
  return { vectors: cached as Array<number[] | null>, totalTokens: result.totalTokens };
}

async function embedOpenAi(inputs: string[], apiKeys: string[]): Promise<Omit<EmbeddingResult, "provider">> {
  let lastErr: unknown;
  for (const apiKey of apiKeys) {
    try {
      const openai = new OpenAI({ apiKey, timeout: 25_000, maxRetries: 0 });
      const BATCH = 96;
      const all: number[][] = [];
      let total = 0;

      for (let i = 0; i < inputs.length; i += BATCH) {
        const batch = inputs.slice(i, i + BATCH);
        const response = await openai.embeddings.create({ model: OPENAI_MODEL, input: batch });
        const sorted = [...response.data].sort((a, b) => a.index - b.index);
        for (const x of sorted) all.push(x.embedding);
        total += response.usage?.total_tokens ?? 0;
      }

      return { vectors: all, totalTokens: total };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("OpenAI embeddings failed");
}

async function embedCloudflare(inputs: string[]): Promise<Omit<EmbeddingResult, "provider">> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID as string;
  const token = process.env.CLOUDFLARE_API_TOKEN as string;
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CF_MODEL}`;
  const BATCH = 32;
  const all: number[][] = [];
  for (let i = 0; i < inputs.length; i += BATCH) {
    const batch = inputs.slice(i, i + BATCH);
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: batch }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Embeddings error ${response.status}`);
    const data = (await response.json()) as { result?: { data?: number[][] } };
    const vectors = data.result?.data;
    if (!Array.isArray(vectors) || vectors.length !== batch.length) {
      throw new Error("Unexpected embeddings response");
    }
    all.push(...vectors);
  }
  return { vectors: all, totalTokens: 0 };
}

async function embedGemini(inputs: string[], apiKeys: string[]): Promise<Omit<EmbeddingResult, "provider">> {
  let lastErr: unknown;
  const BATCH = 64;
  for (const apiKey of apiKeys) {
    try {
      const all: number[][] = [];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBED_MODEL}:batchEmbedContents?key=${apiKey}`;
      for (let i = 0; i < inputs.length; i += BATCH) {
        const batch = inputs.slice(i, i + BATCH);
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requests: batch.map((text) => ({
              model: `models/${GEMINI_EMBED_MODEL}`,
              content: { parts: [{ text }] },
              outputDimensionality: 1024,
            })),
          }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error(`Gemini embeddings error ${response.status}`);
        const data = (await response.json()) as { embeddings?: Array<{ values?: number[] }> };
        const list = data.embeddings;
        if (!Array.isArray(list) || list.length !== batch.length) {
          throw new Error("Unexpected Gemini embeddings response");
        }
        for (const item of list) {
          if (!Array.isArray(item.values) || item.values.length === 0) {
            throw new Error("Empty Gemini embedding vector");
          }
          all.push(item.values);
        }
      }
      return { vectors: all, totalTokens: 0 };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("Gemini embeddings failed");
}

async function embedVoyage(inputs: string[], apiKey: string): Promise<Omit<EmbeddingResult, "provider">> {
  const BATCH = 64;
  const all: number[][] = [];
  let total = 0;
  for (let i = 0; i < inputs.length; i += BATCH) {
    const batch = inputs.slice(i, i + BATCH);
    const response = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: VOYAGE_MODEL, input: batch }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Voyage embeddings error ${response.status}`);
    const data = (await response.json()) as {
      data?: Array<{ index: number; embedding: number[] }>;
      usage?: { total_tokens?: number };
    };
    const rows = data.data;
    if (!Array.isArray(rows) || rows.length !== batch.length) {
      throw new Error("Unexpected Voyage embeddings response");
    }
    const sorted = [...rows].sort((a, b) => a.index - b.index);
    for (const row of sorted) all.push(row.embedding);
    total += data.usage?.total_tokens ?? 0;
  }
  return { vectors: all, totalTokens: total };
}

export async function embedQuery(text: string): Promise<number[] | null> {
  const r = await embedTexts([text]);
  return r.vectors[0] ?? null;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
