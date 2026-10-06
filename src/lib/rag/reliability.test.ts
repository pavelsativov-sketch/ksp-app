import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), embedTexts: vi.fn(), embedQuery: vi.fn(), auth: vi.fn(), generate: vi.fn() }));
vi.mock("@/lib/mongo", () => ({
  getDb: mocks.getDb, isMongoConfigured: () => true,
  COL: { textbooks: "textbooks", textbookChunks: "chunks" },
  toObjectId: (id: string) => /^[a-f0-9]{24}$/i.test(id) ? new ObjectId(id) : null,
}));
vi.mock("./embed", () => ({ embedTexts: mocks.embedTexts, embedQuery: mocks.embedQuery, cosineSimilarity: () => 1 }));
vi.mock("./pdf", () => ({ extractPdfPages: vi.fn() }));
vi.mock("@/lib/api-auth", () => ({ requireApiAuth: mocks.auth }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: async () => ({ ok: true }) }));
vi.mock("@/lib/billing/quota", () => ({
  reserveQuota: async () => ({
    ok: true,
    reservation: { remaining: null, finalize: async () => {} },
  }),
  reserveQuotaOrResponse: async () => ({
    ok: true,
    reservation: { remaining: null, finalize: async () => {} },
  }),
  quotaFailure: () => ({ status: 429, body: {} }),
}));
vi.mock("@/lib/ai/generate", () => ({ generateKsp: mocks.generate }));

import { embedTextbookChunks, embeddingProgress, EMBEDDING_BATCH_SIZE, EMBEDDING_LEASE_MS, type TextbookDoc } from "./ingest";
import { retrieveTextbookContext, ATLAS_COOLDOWN_MS } from "./retrieve";
import { resetRagCache } from "./cache";
import { POST as resume } from "@/app/api/textbooks/[id]/embeddings/route";
import { POST as generate } from "@/app/api/ai/generate/route";

const id = "abcdefabcdefabcdefabcdef";
const baseBook = (): TextbookDoc => ({
  _id: new ObjectId(id), title: "Учебник", owner_id: "owner", subject_id: null, grade: 5,
  status: "ready", status_error: null, visibility: "private", chunk_count: 1, page_count: 1,
  has_embeddings: false, created_at: new Date(), updated_at: new Date(),
});
type Row = { _id: ObjectId; chunk_index: number; content: string; embedding: number[] | null };

/** Stateful mock implements the relevant atomic lease and null-embedding cursor semantics. */
function ingestionDb(count: number) {
  const book = { ...baseBook(), chunk_count: count };
  const rows: Row[] = Array.from({ length: count }, (_, i) => ({ _id: new ObjectId(), chunk_index: i, content: `chunk ${i}`, embedding: null }));
  const books = {
    findOne: vi.fn(async () => book),
    findOneAndUpdate: vi.fn(async (filter, update) => {
      if (filter.$or && book.embedding_lease_until && book.embedding_lease_until.getTime() > Date.now()) return null;
      if (filter.embedding_lease_token && filter.embedding_lease_token !== book.embedding_lease_token) return null;
      Object.assign(book, update.$set);
      return { ...book };
    }),
  };
  const chunks = {
    find: vi.fn<(filter: unknown, options?: unknown) => {
      sort: ReturnType<typeof vi.fn>; limit: ReturnType<typeof vi.fn>; toArray: ReturnType<typeof vi.fn>;
    }>(() => {
      let limit = Infinity;
      const cursor = {
        sort: vi.fn(() => cursor), limit: vi.fn((n: number) => { limit = n; return cursor; }),
        toArray: vi.fn(async () => rows.filter((r) => r.embedding === null).slice(0, limit)),
      };
      return cursor;
    }),
    bulkWrite: vi.fn(async (ops) => {
      for (const op of ops) {
        const row = rows.find((r) => r._id.equals(op.updateOne.filter._id));
        if (row && row.embedding === null) row.embedding = op.updateOne.update.$set.embedding;
      }
    }),
    countDocuments: vi.fn(async (filter) => "embedding" in filter ? rows.filter((r) => r.embedding === null).length : rows.length),
  };
  const db = { collection: (name: string) => name === "textbooks" ? books : chunks } as unknown as Db;
  mocks.getDb.mockResolvedValue(db);
  return { db, book, rows, books, chunks };
}

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.__ragAtlasRetryAt = undefined;
  resetRagCache();
  mocks.auth.mockResolvedValue({ user: { id: "owner" } });
  mocks.embedTexts.mockImplementation(async (inputs: string[]) => ({ vectors: inputs.map(() => [1, 2]), totalTokens: 0 }));
  mocks.embedQuery.mockResolvedValue(null);
  mocks.generate.mockResolvedValue({ topic: "generated" });
});
afterEach(() => vi.useRealTimers());

describe("durable bounded embeddings", () => {
  it("persists a batch, retains progress on provider failure, and resumes only missing chunks", async () => {
    const { db, book, chunks } = ingestionDb(130);
    expect(await embedTextbookChunks(id, db)).toMatchObject({ status: "pending", completed: 64, total: 130 });
    expect(chunks.bulkWrite).toHaveBeenCalledTimes(1);
    mocks.embedTexts.mockRejectedValueOnce(new Error("provider secret response"));
    expect(await embedTextbookChunks(id, db)).toMatchObject({ status: "error", completed: 64 });
    expect(book.embedding_error).not.toContain("secret");
    expect(await embedTextbookChunks(id, db)).toMatchObject({ status: "pending", completed: 128 });
    expect(mocks.embedTexts.mock.calls[2][0][0]).toBe("chunk 64");
    expect(await embedTextbookChunks(id, db)).toMatchObject({ status: "ready", completed: 130 });
    await embedTextbookChunks(id, db);
    expect(mocks.embedTexts).toHaveBeenCalledTimes(4);
    expect(book.has_embeddings).toBe(true);
  });

  it("continues through more than 5000 chunks with no request exceeding the batch bound", async () => {
    const { db, book } = ingestionDb(5003);
    for (let i = 0; i < Math.ceil(5003 / EMBEDDING_BATCH_SIZE); i++) await embedTextbookChunks(id, db);
    expect(book.embedded_chunk_count).toBe(5003);
    expect(book.embedding_status).toBe("ready");
    expect(mocks.embedTexts.mock.calls.every(([inputs]) => inputs.length <= EMBEDDING_BATCH_SIZE)).toBe(true);
  });

  it("does not mark absent or malformed vectors complete", async () => {
    const { db, book, chunks } = ingestionDb(2);
    mocks.embedTexts.mockResolvedValueOnce({ vectors: [null, null] });
    expect(await embedTextbookChunks(id, db)).toMatchObject({ status: "error", completed: 0 });
    mocks.embedTexts.mockResolvedValueOnce({ vectors: [[1]] });
    expect(await embedTextbookChunks(id, db)).toMatchObject({ status: "error", completed: 0 });
    expect(chunks.bulkWrite).not.toHaveBeenCalled();
    expect(book.has_embeddings).toBe(false);
  });

  it("blocks concurrent work and reclaims an expired worker lease", async () => {
    vi.useFakeTimers();
    const { db, book } = ingestionDb(2);
    book.embedding_status = "processing";
    book.embedding_lease_until = new Date(Date.now() + EMBEDDING_LEASE_MS);
    expect(await embedTextbookChunks(id, db)).toBeNull();
    expect(mocks.embedTexts).not.toHaveBeenCalled();
    vi.advanceTimersByTime(EMBEDDING_LEASE_MS + 1);
    expect(embeddingProgress(book).status).toBe("pending");
    expect(await embedTextbookChunks(id, db)).toMatchObject({ status: "ready", completed: 2 });
  });

  it("counts partial DB persistence and retries only the remaining rows", async () => {
    const { db, rows, chunks } = ingestionDb(3);
    chunks.bulkWrite.mockImplementationOnce(async () => { rows[0].embedding = [1, 2]; throw new Error("partial write"); });
    expect(await embedTextbookChunks(id, db)).toMatchObject({ status: "error", completed: 1 });
    expect(await embedTextbookChunks(id, db)).toMatchObject({ status: "ready", completed: 3 });
    expect(mocks.embedTexts.mock.calls[1][0]).toEqual(["chunk 1", "chunk 2"]);
  });
});

function retrievalDb(localRows: unknown[] = [], keywordRows: unknown[] = []) {
  const book = baseBook();
  const atlas = vi.fn(async () => [] as unknown[]);
  const cursor = { sort: vi.fn(), limit: vi.fn(), toArray: vi.fn(async () => localRows) };
  cursor.sort.mockReturnValue(cursor); cursor.limit.mockReturnValue(cursor);
  const chunks = {
    find: vi.fn(() => cursor),
    aggregate: vi.fn((pipeline) => ({ toArray: () => pipeline[0].$vectorSearch ? atlas() : Promise.resolve(keywordRows) })),
  };
  mocks.getDb.mockResolvedValue({ collection: (name: string) => name === "textbooks" ? { findOne: async () => book } : chunks });
  return { book, chunks, atlas, cursor };
}
const retrieve = () => retrieveTextbookContext({ textbookId: id, query: "геометрия үшбұрыш", userId: "owner" });

describe("retrieval degradation and recovery", () => {
  it("falls back on a query embedding exception and ranks keywords server-side without a prefix limit", async () => {
    const { chunks } = retrievalDb([], [{ chunk_index: 4500, content: "геометрия" }]);
    mocks.embedQuery.mockRejectedValueOnce(new Error("timeout"));
    const result = await retrieve();
    expect(result).toMatchObject({ method: "keyword", status: "degraded" });
    expect(result?.chunks[0].chunk_index).toBe(4500);
    expect(chunks.find).not.toHaveBeenCalled();
    const pipeline = chunks.aggregate.mock.calls[0][0];
    expect(pipeline[0]).toEqual({ $match: { textbook_id: id } });
    expect(pipeline[pipeline.length - 1]).toEqual({ $limit: 6 });
    expect(pipeline.slice(0, -1).some((stage: object) => "$limit" in stage)).toBe(false);
    expect(JSON.stringify(pipeline)).toContain("үшбұрыш");
    expect(JSON.stringify(pipeline)).not.toContain("embedding");
  });

  it("reprobes Atlas after a cooldown instead of disabling it forever", async () => {
    vi.useFakeTimers();
    const { atlas, book } = retrievalDb([{ content: "local", embedding: [1, 2] }]);
    book.has_embeddings = true;
    mocks.embedQuery.mockResolvedValue([1, 2]);
    atlas.mockRejectedValueOnce(new Error("transient"));
    atlas.mockResolvedValue([{ content: "atlas restored" }]);
    expect((await retrieve())?.status).toBe("degraded");
    await retrieve();
    expect(atlas).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(ATLAS_COOLDOWN_MS + 1);
    expect((await retrieve())?.chunks[0].content).toBe("atlas restored");
    expect(atlas).toHaveBeenCalledTimes(2);
    expect(globalThis.__ragAtlasRetryAt).toBeUndefined();
  });

  it("switches oversized local-vector fallback to whole-book keywords with a warning", async () => {
    const { cursor } = retrievalDb(Array.from({ length: 2001 }, () => ({ content: "prefix", embedding: [1, 2] })), [{ chunk_index: 5001, content: "later match" }]);
    mocks.embedQuery.mockResolvedValue([1, 2]);
    const result = await retrieve();
    expect(cursor.limit).toHaveBeenCalledWith(2001);
    expect(result?.method).toBe("keyword");
    expect(result?.chunks[0].chunk_index).toBe(5001);
    expect(result?.warnings.join(" ")).toContain("весь учебник");
  });

  it("returns unavailable rather than unrelated opening chunks on zero keyword matches", async () => {
    retrievalDb();
    expect(await retrieve()).toMatchObject({ chunks: [], promptBlock: "", status: "unavailable" });
  });

  it("does not embed or search private textbooks for another user", async () => {
    const { book, chunks } = retrievalDb();
    book.owner_id = "someone-else";
    expect(await retrieve()).toBeNull();
    expect(mocks.embedQuery).not.toHaveBeenCalled();
    expect(chunks.aggregate).not.toHaveBeenCalled();
  });
});

describe("authenticated endpoint and generation metadata", () => {
  const request = () => new Request(`http://localhost/api/textbooks/${id}/embeddings`, { method: "POST" });
  const params = () => ({ params: Promise.resolve({ id: id.toUpperCase() }) });
  it("rejects unauthenticated and non-owner work before invoking embeddings", async () => {
    const { book } = ingestionDb(1);
    mocks.auth.mockResolvedValueOnce({ response: new Response(null, { status: 401 }) });
    expect((await resume(request(), params())).status).toBe(401);
    book.owner_id = "other"; book.visibility = "public";
    expect((await resume(request(), params())).status).toBe(403);
    expect(mocks.embedTexts).not.toHaveBeenCalled();
  });
  it("returns persisted progress to owners and reports provider failures as retryable", async () => {
    const { chunks } = ingestionDb(65);
    const response = await resume(request(), params());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ embedding: { status: "pending", completed: 64 } });
    expect(chunks.find.mock.calls[0][0]).toEqual({ textbook_id: id, embedding: null });
    mocks.embedTexts.mockRejectedValueOnce(new Error("down"));
    expect((await resume(request(), params())).status).toBe(503);
    expect((await resume(request(), params())).status).toBe(200);
  });
  it("reports absent context to generation clients rather than silently returning rag:null", async () => {
    retrievalDb();
    const result = await generate(new Request("http://localhost/api/ai/generate", { method: "POST", body: JSON.stringify({ grade: 5, topic: "геометрия", subject: "математика", textbookId: id }) }));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ rag: { status: "unavailable", chunkCount: 0, warnings: expect.any(Array) } });
    expect(mocks.generate.mock.calls[0][0].textbookContext).toBeUndefined();
  });
});
