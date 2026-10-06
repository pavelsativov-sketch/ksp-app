/** Atlas → bounded local vectors → server-side keyword ranking over the entire textbook. */
import { getDb, COL, toObjectId } from "@/lib/mongo";
import { embedQuery, cosineSimilarity } from "./embed";
import { getCachedRetrieval, setCachedRetrieval } from "./cache";
import type { TextbookChunkMatch } from "./types";
import type { TextbookDoc } from "./ingest";

declare global {
  var __ragAtlasRetryAt: number | undefined;
}
export const ATLAS_COOLDOWN_MS = 60_000;
const LOCAL_VECTOR_LIMIT = 2000;
export interface RetrievedContext {
  chunks: TextbookChunkMatch[];
  textbookTitle: string | null;
  promptBlock: string;
  method: "vector" | "keyword";
  status: "ok" | "degraded" | "unavailable";
  warnings: string[];
}

export async function retrieveTextbookContext(opts: {
  textbookId: string;
  query: string;
  k?: number;
  userId?: string | null;
}): Promise<RetrievedContext | null> {
  const k = Math.max(2, Math.min(opts.k ?? 6, 12));
  const oid = toObjectId(opts.textbookId);
  if (!oid) return null;
  const textbookId = oid.toString();
  // Кэш только успешных результатов: null (учебник не готов / чужой) может
  // измениться в течение 24 часов, а кэшировать отказ нельзя. Degraded-результаты
  // (резервные пути) не кэшируем тоже: иначе восстановление после сбоя Atlas
  // (см. __ragAtlasRetryAt) будет невозможно до истечения TTL.
  const cached = getCachedRetrieval(textbookId, opts.query, k, opts.userId ?? null);
  if (cached) return cached;
  const result = await retrieveTextbookContextUncached({ ...opts, k, textbookId });
  if (result && result.status === "ok") {
    setCachedRetrieval(textbookId, opts.query, k, opts.userId ?? null, result);
  }
  return result;
}

async function retrieveTextbookContextUncached(opts: {
  textbookId: string;
  query: string;
  k: number;
  userId?: string | null;
}): Promise<RetrievedContext | null> {
  const { textbookId, query, k, userId } = opts;
  const db = await getDb();
  const tbOid = toObjectId(textbookId);
  if (!tbOid) return null;
  const tb = await db.collection<TextbookDoc>(COL.textbooks).findOne({ _id: tbOid });
  if (!tb || tb.status !== "ready") return null;
  if (tb.owner_id !== userId && tb.visibility !== "public") return null;
  const warnings: string[] = [];
  if (!tb.has_embeddings || (tb.embedding_status && tb.embedding_status !== "ready")) {
    warnings.push("Семантическая индексация учебника не завершена. Продолжите её на странице учебников.");
  }
  let queryEmbedding: number[] | null = null;
  try {
    queryEmbedding = await embedQuery(query);
  } catch {
    warnings.push("Сервис embeddings временно недоступен; используется поиск по словам.");
  }
  if (queryEmbedding) {
    const atlas = await vectorSearchAtlas(db, textbookId, queryEmbedding, k);
    if (atlas && atlas.length > 0) {
      return buildContext(tb.title, atlas.map(toMatch), "vector", warnings);
    }
    warnings.push("Atlas-поиск недоступен или не вернул результатов; применён резервный поиск.");
    // Do not silently rank only the first 2000 chunks. For larger books use whole-book keyword ranking.
    const docs = await db.collection(COL.textbookChunks)
      .find({ textbook_id: textbookId }, { projection: { content: 1, chunk_index: 1, page_number: 1, embedding: 1 } })
      .sort({ chunk_index: 1 }).limit(LOCAL_VECTOR_LIMIT + 1).toArray();
    if (docs.length <= LOCAL_VECTOR_LIMIT) {
      const scored = docs.filter((d) => Array.isArray(d.embedding) && d.embedding.length === queryEmbedding!.length)
        .map((d) => ({ doc: d, score: cosineSimilarity(queryEmbedding!, d.embedding) }))
        .sort((a, b) => b.score - a.score).slice(0, k);
      if (scored.length) return buildContext(tb.title, scored.map((s, i) => toMatch(s.doc, i)), "vector", warnings);
    } else {
      warnings.push("Учебник слишком большой для локального векторного поиска; поиск по словам охватывает весь учебник.");
    }
  }
  warnings.push("Контекст подобран по ключевым словам, а не по смысловой близости.");
  const tokens = tokenize(query);
  if (!tokens.length) return buildContext(tb.title, [], "keyword", [...warnings, "В запросе нет слов для поиска."]);
  // $match uses the existing textbook_id/chunk_index index. Ranking/limit happen on Mongo,
  // not on a truncated client-side prefix. No Atlas/text index or corpus transfer is required.
  const docs = await db.collection(COL.textbookChunks).aggregate([
    { $match: { textbook_id: textbookId } },
    { $project: { content: 1, chunk_index: 1, page_number: 1, keyword_score: { $add: tokens.map((token) => ({
      $cond: [
        { $gte: [{ $indexOfCP: [{ $toLower: { $ifNull: ["$content", ""] } }, { $literal: token }] }, 0] },
        token.length >= 6 ? 2 : 1, 0,
      ],
    })) } } },
    { $match: { keyword_score: { $gt: 0 } } },
    { $sort: { keyword_score: -1, chunk_index: 1 } },
    { $limit: k },
  ], { maxTimeMS: 5_000 }).toArray();
  if (!docs.length) warnings.push("Подходящие фрагменты учебника не найдены; план создан без контекста учебника.");
  return buildContext(tb.title, docs.map(toMatch), "keyword", warnings);
}

/** Failures expire: a transient timeout or newly created Atlas index is probed again. */
async function vectorSearchAtlas(db: Awaited<ReturnType<typeof getDb>>, textbookId: string, embedding: number[], k: number) {
  if ((globalThis.__ragAtlasRetryAt ?? 0) > Date.now()) return null;
  try {
    const results = await db.collection(COL.textbookChunks).aggregate([
      { $vectorSearch: {
        index: "textbook_chunks_vector", path: "embedding", queryVector: embedding,
        filter: { textbook_id: textbookId }, numCandidates: Math.max(50, k * 20), limit: k,
      } },
      { $project: { content: 1, chunk_index: 1, page_number: 1 } },
    ], { maxTimeMS: 3_000 }).toArray();
    globalThis.__ragAtlasRetryAt = undefined;
    return results;
  } catch {
    globalThis.__ragAtlasRetryAt = Date.now() + ATLAS_COOLDOWN_MS;
    return null;
  }
}

function toMatch(doc: unknown, i: number): TextbookChunkMatch {
  const d = doc as { _id?: { toString(): string }; chunk_index?: number; page_number?: number | null; content?: unknown };
  return {
    id: d._id?.toString() ?? `chunk-${i}`, chunk_index: d.chunk_index ?? i,
    page_number: d.page_number ?? null, content: String(d.content ?? ""), similarity: 0,
  };
}

function buildContext(title: string, chunks: TextbookChunkMatch[], method: "vector" | "keyword", warnings: string[]): RetrievedContext {
  const nonEmpty = chunks.filter((c) => c.content && c.content.trim().length > 0);
  const promptBlock = nonEmpty.length === 0 ? "" :
    `Цитаты из учебника «${title}» (используй эти фрагменты как ОПОРУ; ссылайся в тексте КСП на стр. № при необходимости):\n\n` +
    nonEmpty.map((c, i) => `[${i + 1}] стр. ${c.page_number ?? "?"}: ${truncate(c.content, 600)}`).join("\n\n");
  return { chunks: nonEmpty, textbookTitle: title, promptBlock, method, warnings,
    status: nonEmpty.length === 0 ? "unavailable" : warnings.length ? "degraded" : "ok" };
}

function tokenize(s: string): string[] {
  // Include Kazakh letters, not only the Russian alphabet.
  return [...new Set(s.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/)
    .filter((w) => w.length >= 3))].slice(0, 24);
}
function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
