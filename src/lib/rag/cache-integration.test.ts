/**
 * Интеграция кэша с embed и retrieve: повторный запрос не должен ни звать
 * провайдера, ни обращаться к базе.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), embedQuery: vi.fn() }));
vi.mock("@/lib/mongo", () => ({
  getDb: mocks.getDb,
  COL: { textbooks: "textbooks", textbookChunks: "chunks" },
  toObjectId: (id: string) => /^[a-f0-9]{24}$/i.test(id) ? new ObjectId(id) : null,
}));
vi.mock("./embed", async (original) => ({
  ...(await original<typeof import("./embed")>()),
  embedQuery: mocks.embedQuery,
}));

import { embedTexts } from "./embed";
import { retrieveTextbookContext } from "./retrieve";
import { getRagCacheMetrics, resetRagCache } from "./cache";

const fetchMock = vi.fn();

beforeEach(() => {
  resetRagCache();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.unstubAllEnvs();
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acc");
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "tok");
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ result: { data: [[0.1, 0.2]] } }),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("embedTexts + cache", () => {
  it("calls the provider once for repeated texts and serves the rest from cache", async () => {
    const first = await embedTexts(["текст"]);
    expect(first.provider).toBe("cloudflare");
    expect(first.vectors).toEqual([[0.1, 0.2]]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = await embedTexts(["текст"]);
    expect(second.vectors).toEqual([[0.1, 0.2]]);
    expect(fetchMock).toHaveBeenCalledTimes(1); // кэш-хит

    const m = getRagCacheMetrics();
    expect(m.hits).toBe(1);
    expect(m.misses).toBe(1);
  });

  it("fetches only missing texts when the batch is partially cached", async () => {
    await embedTexts(["текст"]); // кэширует "текст"
    fetchMock.mockClear();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { data: [[0.3, 0.4]] } }),
    });
    const r = await embedTexts(["текст", "новый"]);
    expect(r.vectors).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    expect(fetchMock).toHaveBeenCalledTimes(1); // только "новый" ушёл в провайдер
    expect(fetchMock.mock.calls[0][1].body).toContain("новый");
  });
});

describe("retrieveTextbookContext + cache", () => {
  const id = "abcdefabcdefabcdefabcdef";

  function retrievalDb() {
    const book = {
      _id: new ObjectId(id), title: "Учебник", owner_id: "owner", status: "ready",
      visibility: "private", has_embeddings: true,
    };
    const chunks = {
      find: vi.fn(() => {
        const cursor = { sort: () => cursor, limit: () => cursor, toArray: async () => [] };
        return cursor;
      }),
      aggregate: vi.fn((pipeline: Array<Record<string, unknown>>) => ({
        toArray: async () => pipeline[0].$vectorSearch
          ? [{ _id: new ObjectId(), content: "найденный фрагмент", chunk_index: 1, page_number: 3 }]
          : [],
      })),
    };
    mocks.getDb.mockResolvedValue({ collection: (name: string) => name === "textbooks" ? { findOne: async () => book } : chunks });
    return { book, chunks };
  }

  it("serves a repeated query from cache without touching the DB or embeddings", async () => {
    retrievalDb();
    mocks.embedQuery.mockResolvedValue([1, 2]); // путь векторного поиска
    const first = await retrieveTextbookContext({ textbookId: id, query: "дроби", userId: "owner" });
    expect(first).not.toBeNull();
    expect(first?.method).toBe("vector");
    expect(first?.status).toBe("ok");
    const callsAfterFirst = mocks.getDb.mock.calls.length;

    const second = await retrieveTextbookContext({ textbookId: id, query: "дроби", userId: "owner" });
    expect(second).toEqual(first);
    expect(mocks.getDb.mock.calls.length).toBe(callsAfterFirst); // кэш-хит
    expect(mocks.embedQuery).toHaveBeenCalledTimes(1);
    const m = getRagCacheMetrics();
    expect(m.hits).toBe(1);
    expect(m.misses).toBe(1);
  });

  it("does not cache a null result (textbook not ready)", async () => {
    const { book } = retrievalDb();
    book.status = "pending";
    expect(await retrieveTextbookContext({ textbookId: id, query: "дроби", userId: "owner" })).toBeNull();
    // Учебник стал готов — запрос снова уходит в базу, а не в кэш с null.
    book.status = "ready";
    const r = await retrieveTextbookContext({ textbookId: id, query: "дроби", userId: "owner" });
    expect(r).not.toBeNull();
    expect(mocks.getDb.mock.calls.length).toBeGreaterThan(1);
  });

  it("does not cache degraded results so Atlas cooldown recovery still works", async () => {
    const { book } = retrievalDb();
    book.has_embeddings = false; // предупреждение → любой результат будет "degraded"
    mocks.embedQuery.mockResolvedValue([1, 2]);
    const first = await retrieveTextbookContext({ textbookId: id, query: "дроби", userId: "owner" });
    expect(first?.status).toBe("degraded");
    const calls = mocks.getDb.mock.calls.length;
    await retrieveTextbookContext({ textbookId: id, query: "дроби", userId: "owner" });
    expect(mocks.getDb.mock.calls.length).toBeGreaterThan(calls); // не из кэша
  });

  it("does not serve a cached result for a different user", async () => {
    retrievalDb();
    mocks.embedQuery.mockResolvedValue([1, 2]);
    await retrieveTextbookContext({ textbookId: id, query: "дроби", userId: "owner" });
    const calls = mocks.getDb.mock.calls.length;
    await retrieveTextbookContext({ textbookId: id, query: "дроби", userId: "other" });
    expect(mocks.getDb.mock.calls.length).toBeGreaterThan(calls);
  });
});
