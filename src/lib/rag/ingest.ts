/** PDF → persisted chunks; embeddings are advanced by explicit resumable requests. */
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { getDb, COL, toObjectId } from "@/lib/mongo";
import { extractPdfPages } from "./pdf";
import { chunkPages } from "./chunk";
import { embedTexts } from "./embed";

export type EmbeddingStatus = "pending" | "processing" | "ready" | "error";
export interface TextbookDoc {
  _id?: ObjectId;
  owner_id: string;
  title: string;
  subject_id: string | null;
  grade: number | null;
  status: "pending" | "indexing" | "ready" | "error";
  status_error: string | null;
  page_count: number | null;
  chunk_count: number;
  visibility: "private" | "unlisted" | "public";
  has_embeddings: boolean;
  // Optional for textbooks uploaded before resumable indexing was introduced.
  embedding_status?: EmbeddingStatus;
  embedded_chunk_count?: number;
  embedding_error?: string | null;
  embedding_lease_token?: string | null;
  embedding_lease_until?: Date | null;
  created_at: Date;
  updated_at: Date;
}

export function embeddingProgress(tb: Pick<TextbookDoc, "has_embeddings" | "chunk_count" | "embedding_status" | "embedded_chunk_count" | "embedding_error" | "embedding_lease_until">) {
  // An interrupted worker becomes resumable without a scheduler or manual DB repair.
  const expired = tb.embedding_status === "processing" &&
    (!tb.embedding_lease_until || new Date(tb.embedding_lease_until).getTime() <= Date.now());
  return {
    status: expired ? "pending" as const : tb.embedding_status ?? (tb.has_embeddings ? "ready" as const : "pending" as const),
    completed: tb.embedded_chunk_count ?? (tb.has_embeddings ? tb.chunk_count : 0),
    total: tb.chunk_count,
    error: tb.embedding_error ?? null,
  };
}

export async function ingestTextbookFromBuffer(opts: {
  db?: Db;
  textbookId: string;
  pdfBuffer: Buffer;
}): Promise<{ pageCount: number; chunkCount: number; hasEmbeddings: boolean; embeddingsDeferred: boolean }> {
  const db = opts.db ?? (await getDb());
  const oid = toObjectId(opts.textbookId);
  if (!oid) throw new Error("Некорректный id учебника");
  const textbooks = db.collection<TextbookDoc>(COL.textbooks);
  const chunksCol = db.collection(COL.textbookChunks);
  await textbooks.updateOne({ _id: oid }, { $set: { status: "indexing", status_error: null, updated_at: new Date() } });
  try {
    const { pages, totalPages } = await extractPdfPages(opts.pdfBuffer);
    if (pages.length === 0) throw new Error("PDF не содержит извлекаемого текста (возможно скан без OCR)");
    const chunks = chunkPages(pages);
    if (chunks.length === 0) throw new Error("После чанкинга пусто");
    await chunksCol.deleteMany({ textbook_id: opts.textbookId });
    for (let i = 0; i < chunks.length; i += 200) {
      await chunksCol.insertMany(chunks.slice(i, i + 200).map((c) => ({
        textbook_id: opts.textbookId,
        chunk_index: c.index,
        page_number: c.pageNumber,
        content: c.content,
        embedding: null,
      })), { ordered: false });
    }
    await textbooks.updateOne({ _id: oid }, { $set: {
      status: "ready", status_error: null, page_count: totalPages, chunk_count: chunks.length,
      has_embeddings: false, embedding_status: "pending", embedded_chunk_count: 0,
      embedding_error: null, embedding_lease_token: null, embedding_lease_until: null,
      updated_at: new Date(),
    } });
    return { pageCount: totalPages, chunkCount: chunks.length, hasEmbeddings: false, embeddingsDeferred: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ingest failed";
    await textbooks.updateOne({ _id: oid }, { $set: { status: "error", status_error: msg, updated_at: new Date() } });
    throw e;
  }
}

export const EMBEDDING_BATCH_SIZE = 64;
export const EMBEDDING_LEASE_MS = 120_000;

/** One provider call and one persisted batch per request. Null means another worker owns the lease.
 * Missing embeddings are the durable cursor: retries never start from zero, including beyond 5000.
 */
export async function embedTextbookChunks(textbookId: string, suppliedDb?: Db) {
  const db = suppliedDb ?? await getDb();
  const oid = toObjectId(textbookId);
  if (!oid) throw new Error("Некорректный id учебника");
  const chunksCol = db.collection(COL.textbookChunks);
  const textbooks = db.collection<TextbookDoc>(COL.textbooks);
  const token = new ObjectId().toString();
  const claimed = await textbooks.findOneAndUpdate({
    _id: oid, status: "ready",
    $or: [{ embedding_lease_until: null }, { embedding_lease_until: { $lte: new Date() } }],
  }, { $set: {
    embedding_status: "processing", embedding_error: null,
    embedding_lease_token: token, embedding_lease_until: new Date(Date.now() + EMBEDDING_LEASE_MS),
    updated_at: new Date(),
  } }, { returnDocument: "after" });
  if (!claimed) return null;

  const missingFilter = { textbook_id: textbookId, embedding: null };
  let error: string | null = null;
  try {
    const missing = await chunksCol.find(missingFilter, { projection: { _id: 1, content: 1 } })
      .sort({ chunk_index: 1 }).limit(EMBEDDING_BATCH_SIZE).toArray();
    if (missing.length) {
      const { vectors } = await embedTexts(missing.map((d) => String(d.content ?? "")));
      if (vectors.length !== missing.length || vectors.some((v) =>
        !v || v.length === 0 || !v.every(Number.isFinite))) {
        throw new Error("Embedding provider unavailable or returned invalid vectors");
      }
      // Persist immediately; partial bulk-write success is also retained on retry.
      await chunksCol.bulkWrite(missing.map((d, i) => ({ updateOne: {
        filter: { _id: d._id, embedding: null }, update: { $set: { embedding: vectors[i] } },
      } })), { ordered: false });
    }
  } catch {
    // Do not expose provider responses/credentials through persisted public metadata.
    error = "Не удалось создать embeddings. Проверьте настройку сервиса и повторите попытку. Поиск по словам доступен.";
  }
  // Count persisted rows, not attempted work. If this fails, lease expiry recovers the job.
  const total = await chunksCol.countDocuments({ textbook_id: textbookId });
  const remaining = await chunksCol.countDocuments(missingFilter);
  const status: EmbeddingStatus = error ? "error" : remaining === 0 && total > 0 ? "ready" : "pending";
  const updated = await textbooks.findOneAndUpdate({ _id: oid, embedding_lease_token: token }, { $set: {
    embedding_status: status, embedded_chunk_count: total - remaining, chunk_count: total,
    has_embeddings: remaining === 0 && total > 0, embedding_error: error,
    embedding_lease_token: null, embedding_lease_until: null, updated_at: new Date(),
  } }, { returnDocument: "after" });
  return updated ? embeddingProgress(updated) : null;
}
