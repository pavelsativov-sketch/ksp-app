/**
 * Кэш RAG-запросов: embeddings и результаты поиска по учебнику.
 *
 * Зачем:
 *  - Один и тот же учебник спрашивают много раз за урок (учитель уточняет
 *    тему, перегенерирует план). Повторный вызов embeddings — это деньги
 *    (OpenAI) или квота (Cloudflare) без нового результата.
 *  - Поиск по учебнику — тяжёлая агрегация; кэш снимает её с горячего пути.
 *
 * Устройство:
 *  - Два LRU-кэша в памяти изолята: для векторов (ключ — хеш текста + модели)
 *    и для результатов retrieve (ключ — хеш textbookId + query + k + userId).
 *  - TTL 24 часа: учебник мог быть переиндексирован, план — пересохранён.
 *  - Максимум 1000 записей на кэш: память изолята ограничена.
 *  - Метрики hits/misses/evictions/expirations — видно, кэш вообще работает.
 *
 * Кэш живёт в памяти изолята (globalThis), как и __ragAtlasRetryAt в retrieve.
 */
import { createHash } from "node:crypto";
import type { RetrievedContext } from "./retrieve";

export const RAG_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 часа
export const RAG_CACHE_MAX_ENTRIES = 1000;

export interface RagCacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  expirations: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

declare global {
  var __ragCacheMetrics: RagCacheMetrics | undefined;
}

class LruCache<T> {
  private map = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly maxSize: number,
    private readonly ttlMs: number,
    private readonly metrics: RagCacheMetrics,
  ) {}

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) {
      this.metrics.misses += 1;
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      // Истёкшее удаляем и считаем промахом: вызывающий обязан пересчитать.
      this.map.delete(key);
      this.metrics.expirations += 1;
      this.metrics.misses += 1;
      return undefined;
    }
    // LRU: обновляем позицию — недавно использованные уходят в хвост.
    this.map.delete(key);
    this.map.set(key, entry);
    this.metrics.hits += 1;
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
      this.metrics.evictions += 1;
    }
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}

function metrics(): RagCacheMetrics {
  if (!globalThis.__ragCacheMetrics) {
    globalThis.__ragCacheMetrics = { hits: 0, misses: 0, evictions: 0, expirations: 0 };
  }
  return globalThis.__ragCacheMetrics;
}

const embeddingCache = new LruCache<number[] | null>(RAG_CACHE_MAX_ENTRIES, RAG_CACHE_TTL_MS, metrics());
const retrievalCache = new LruCache<RetrievedContext>(RAG_CACHE_MAX_ENTRIES, RAG_CACHE_TTL_MS, metrics());

/** Ключ кэша embeddings: хеш текста + модели. Модель в ключе обязателен:  */
export function embeddingCacheKey(text: string, model: string): string {
  return createHash("sha256").update(`${model}::${text}`).digest("hex");
}

/** Ключ кэша результата поиска: хеш всех параметров, влияющих на выдачу. */
export function retrievalCacheKey(textbookId: string, query: string, k: number, userId: string | null): string {
  return createHash("sha256").update(`${textbookId}::${query}::${k}::${userId ?? ""}`).digest("hex");
}

export function getCachedEmbedding(text: string, model: string): number[] | null | undefined {
  return embeddingCache.get(embeddingCacheKey(text, model));
}

export function setCachedEmbedding(text: string, model: string, vector: number[] | null): void {
  embeddingCache.set(embeddingCacheKey(text, model), vector);
}

export function getCachedRetrieval(
  textbookId: string,
  query: string,
  k: number,
  userId: string | null,
): RetrievedContext | undefined {
  return retrievalCache.get(retrievalCacheKey(textbookId, query, k, userId));
}

export function setCachedRetrieval(
  textbookId: string,
  query: string,
  k: number,
  userId: string | null,
  result: RetrievedContext,
): void {
  retrievalCache.set(retrievalCacheKey(textbookId, query, k, userId), result);
}

/** Кумулятивные метрики кэша (hits/misses/evictions/expirations). */
export function getRagCacheMetrics(): RagCacheMetrics {
  return { ...metrics() };
}

/** Размер кэшей — для мониторинга и тестов. */
export function getRagCacheSize(): { embeddings: number; retrievals: number } {
  return { embeddings: embeddingCache.size, retrievals: retrievalCache.size };
}

/** Полный сброс кэша и метрик. Используется в тестах и при переиндексации. */
export function resetRagCache(): void {
  embeddingCache.clear();
  retrievalCache.clear();
  // Мутируем существующий объект, а не заменяем: LruCache держит ссылку.
  const m = metrics();
  m.hits = 0;
  m.misses = 0;
  m.evictions = 0;
  m.expirations = 0;
}
