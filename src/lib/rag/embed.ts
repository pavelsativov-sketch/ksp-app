import OpenAI from "openai";
import { getCachedEmbedding, setCachedEmbedding } from "./cache";

const OPENAI_MODEL = "text-embedding-3-small";
// Бесплатная альтернатива: многоязычная модель Cloudflare (RU/KK понимает).
const CF_MODEL = "@cf/baai/bge-m3";

export interface EmbeddingResult {
  vectors: Array<number[] | null>; // null — embeddings недоступны (нет ключа)
  totalTokens: number;
  /** Какой провайдер посчитал векторы: платный OpenAI, бесплатный Cloudflare или none. */
  provider: "openai" | "cloudflare" | "none";
}

export async function embedTexts(inputs: string[]): Promise<EmbeddingResult> {
  if (inputs.length === 0) return { vectors: [], totalTokens: 0, provider: "none" };
  if (process.env.OPENAI_API_KEY) {
    return { ...(await embedWithCache(inputs, OPENAI_MODEL)), provider: "openai" };
  }
  if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) {
    return { ...(await embedWithCache(inputs, CF_MODEL)), provider: "cloudflare" };
  }
  return { vectors: inputs.map(() => null), totalTokens: 0, provider: "none" };
}

/**
 * Кэшированный путь: сначала ищем в LRU-кэше, в провайдер идём только
 * с теми текстами, которых в кэше нет. Ключ — хеш текста + модели, поэтому
 * смена провайдера (OpenAI ↔ Cloudflare) не даёт чужих векторов.
 */
async function embedWithCache(inputs: string[], model: string): Promise<Omit<EmbeddingResult, "provider">> {
  const cached = inputs.map((text) => getCachedEmbedding(text, model));
  const missing: Array<{ index: number; text: string }> = [];
  cached.forEach((vector, index) => {
    if (vector === undefined) missing.push({ index, text: inputs[index] });
  });
  if (missing.length === 0) {
    return { vectors: cached as Array<number[] | null>, totalTokens: 0 };
  }
  const fetched = missing.map((m) => m.text);
  const result = model === OPENAI_MODEL ? await embedOpenAi(fetched) : await embedCloudflare(fetched);
  missing.forEach((m, i) => {
    const vector = result.vectors[i] ?? null;
    cached[m.index] = vector;
    setCachedEmbedding(m.text, model, vector);
  });
  return { vectors: cached as Array<number[] | null>, totalTokens: result.totalTokens };
}

async function embedOpenAi(inputs: string[]): Promise<Omit<EmbeddingResult, "provider">> {
  const apiKey = process.env.OPENAI_API_KEY as string;
  // Keep a single resumable request below the worker/request budget.
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

export async function embedQuery(text: string): Promise<number[] | null> {
  const cached = getCachedEmbedding(text, process.env.OPENAI_API_KEY ? OPENAI_MODEL : CF_MODEL);
  if (cached !== undefined) return cached;
  const r = await embedTexts([text]);
  return r.vectors[0];
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
