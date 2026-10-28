import { NextResponse } from "next/server";
import { getDb, COL, toObjectId, isMongoConfigured } from "@/lib/mongo";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { embedTextbookChunks, embeddingProgress, type TextbookDoc } from "@/lib/rag/ingest";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Explicit owner-only retry/resume: at most 64 chunks, no background queue required. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  // Вычисление embeddings — платная облачная операция: строгий лимит,
  // чтобы публичные учебники Арман-ПВ нельзя было пересчитывать бесконечно.
  const rl = await checkRateLimitAsync(`embeddings:${auth.user.id}`, 12, 3600_000);
  if (!rl.ok) {
    const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Превышен лимит пересчёта embeddings (12 в час). Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const { id } = await params;
  const oid = toObjectId(id);
  if (!oid) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  if (!isMongoConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  try {
    const db = await getDb();
    const tb = await db.collection<TextbookDoc>(COL.textbooks).findOne({ _id: oid });
    if (!tb) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (tb.owner_id !== auth.user.id && tb.owner_id !== "system:armanpv") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (tb.status !== "ready") return NextResponse.json({ error: "Текст учебника ещё не готов" }, { status: 409 });
    // Canonical string matters because textbook_id is stored as a string on chunks.
    const embedding = await embedTextbookChunks(oid.toString(), db);
    if (!embedding) return NextResponse.json({
      error: "Пакет уже обрабатывается. Повторите позже.", embedding: embeddingProgress(tb),
    }, { status: 409, headers: { "Retry-After": "5" } });
    return NextResponse.json({ embedding }, { status: embedding.status === "error" ? 503 : 200 });
  } catch {
    return NextResponse.json({ error: "Не удалось обработать пакет. Сохранённый прогресс не потерян; повторите позже." }, { status: 503 });
  }
}
