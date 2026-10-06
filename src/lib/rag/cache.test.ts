import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import {
  embeddingCacheKey,
  getCachedEmbedding,
  getCachedRetrieval,
  getRagCacheMetrics,
  getRagCacheSize,
  resetRagCache,
  retrievalCacheKey,
  setCachedEmbedding,
  setCachedRetrieval,
  RAG_CACHE_MAX_ENTRIES,
  RAG_CACHE_TTL_MS,
} from "./cache";
import type { RetrievedContext } from "./retrieve";

beforeEach(() => {
  resetRagCache();
});

describe("cache keys", () => {
  it("embedding key is deterministic and separates text from model", () => {
    expect(embeddingCacheKey("текст", "m1")).toBe(embeddingCacheKey("текст", "m1"));
    expect(embeddingCacheKey("текст", "m1")).not.toBe(embeddingCacheKey("текст", "m2"));
    expect(embeddingCacheKey("текст", "m1")).not.toBe(embeddingCacheKey("текст2", "m1"));
  });

  it("retrieval key separates all parameters that affect the result", () => {
    const base = retrievalCacheKey("book", "query", 6, "user");
    expect(base).toBe(retrievalCacheKey("book", "query", 6, "user"));
    expect(base).not.toBe(retrievalCacheKey("book2", "query", 6, "user"));
    expect(base).not.toBe(retrievalCacheKey("book", "query2", 6, "user"));
    expect(base).not.toBe(retrievalCacheKey("book", "query", 12, "user"));
    expect(base).not.toBe(retrievalCacheKey("book", "query", 6, null));
  });
});

describe("embedding cache", () => {
  it("returns undefined for unknown text and round-trips known text", () => {
    expect(getCachedEmbedding("нет в кэше", "m")).toBeUndefined();
    setCachedEmbedding("есть в кэше", "m", [0.1, 0.2]);
    expect(getCachedEmbedding("есть в кэше", "m")).toEqual([0.1, 0.2]);
  });

  it("caches null vectors (provider unavailable) like any other value", () => {
    setCachedEmbedding("текст", "m", null);
    expect(getCachedEmbedding("текст", "m")).toBeNull();
  });

  it("does not mix vectors across models", () => {
    setCachedEmbedding("текст", "openai", [1, 2]);
    setCachedEmbedding("текст", "cloudflare", [3, 4]);
    expect(getCachedEmbedding("текст", "openai")).toEqual([1, 2]);
    expect(getCachedEmbedding("текст", "cloudflare")).toEqual([3, 4]);
  });

  it("counts hits and misses in metrics", () => {
    setCachedEmbedding("текст", "m", [1]);
    getCachedEmbedding("текст", "m"); // hit
    getCachedEmbedding("другого нет", "m"); // miss
    const m = getRagCacheMetrics();
    expect(m.hits).toBe(1);
    expect(m.misses).toBe(1);
  });
});

describe("LRU eviction", () => {
  it("evicts the least recently used entry beyond max size", () => {
    // Заполняем кэш под завязку: max + 1 запись.
    for (let i = 0; i < RAG_CACHE_MAX_ENTRIES; i++) {
      setCachedEmbedding(`text-${i}`, "m", [i]);
    }
    expect(getRagCacheSize().embeddings).toBe(RAG_CACHE_MAX_ENTRIES);
    // Первая запись — кандидат на вытеснение, но сначала обратимся к ней:
    // это обновит её LRU-позицию, и вытеснится вторая.
    expect(getCachedEmbedding("text-0", "m")).toEqual([0]);
    setCachedEmbedding("text-new", "m", [999]);
    expect(getRagCacheSize().embeddings).toBe(RAG_CACHE_MAX_ENTRIES);
    // text-1 была использована раньше всех — её вытеснили.
    expect(getCachedEmbedding("text-1", "m")).toBeUndefined();
    expect(getCachedEmbedding("text-0", "m")).toEqual([0]);
    expect(getCachedEmbedding("text-new", "m")).toEqual([999]);
    expect(getRagCacheMetrics().evictions).toBe(1);
  });
});

describe("TTL expiry", () => {
  it("expires entries after the TTL and counts expirations", () => {
    vi.useFakeTimers();
    try {
      setCachedEmbedding("текст", "m", [1]);
      expect(getCachedEmbedding("текст", "m")).toEqual([1]);
      vi.advanceTimersByTime(RAG_CACHE_TTL_MS + 1);
      expect(getCachedEmbedding("текст", "m")).toBeUndefined();
      const m = getRagCacheMetrics();
      expect(m.expirations).toBe(1);
      expect(m.misses).toBe(1); // истёкшая запись считается промахом
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("retrieval cache", () => {
  const ctx = (title: string): RetrievedContext => ({
    chunks: [],
    textbookTitle: title,
    promptBlock: "",
    method: "keyword",
    status: "ok",
    warnings: [],
  });

  it("round-trips a retrieval result", () => {
    expect(getCachedRetrieval("book", "q", 6, "user")).toBeUndefined();
    setCachedRetrieval("book", "q", 6, "user", ctx("Учебник"));
    expect(getCachedRetrieval("book", "q", 6, "user")).toMatchObject({ textbookTitle: "Учебник" });
  });

  it("does not mix results across users or k", () => {
    setCachedRetrieval("book", "q", 6, "user", ctx("A"));
    expect(getCachedRetrieval("book", "q", 6, "other")).toBeUndefined();
    expect(getCachedRetrieval("book", "q", 12, "user")).toBeUndefined();
  });
});

describe("resetRagCache", () => {
  it("clears entries and metrics", () => {
    setCachedEmbedding("текст", "m", [1]);
    setCachedRetrieval("book", "q", 6, "user", {
      chunks: [], textbookTitle: "T", promptBlock: "", method: "keyword", status: "ok", warnings: [],
    });
    getCachedEmbedding("текст", "m"); // hit
    resetRagCache();
    expect(getRagCacheSize()).toEqual({ embeddings: 0, retrievals: 0 });
    expect(getRagCacheMetrics()).toEqual({ hits: 0, misses: 0, evictions: 0, expirations: 0 });
    expect(getCachedEmbedding("текст", "m")).toBeUndefined();
    expect(getCachedRetrieval("book", "q", 6, "user")).toBeUndefined();
  });
});
