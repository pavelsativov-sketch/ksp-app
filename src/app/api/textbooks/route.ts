import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb, COL, isMongoConfigured } from "@/lib/mongo";
import { embeddingProgress, type TextbookDoc } from "@/lib/rag/ingest";

export const runtime = "nodejs";

/** GET /api/textbooks — список учебников текущего юзера + публичные. */
export async function GET() {
  if (!isMongoConfigured()) {
    return NextResponse.json({ textbooks: [] });
  }
  const user = await getCurrentUser();
  const db = await getDb();

  const filter = user?.id
    ? { $or: [{ owner_id: user.id }, { visibility: "public" as const }] }
    : { visibility: "public" as const };

  const docs = await db
    .collection<TextbookDoc>(COL.textbooks)
    .find(filter)
    .sort({ updated_at: -1 })
    .limit(200)
    .toArray();

  const textbooks = docs.map((d) => ({
    id: d._id.toString(),
    title: d.title,
    subject_id: d.subject_id,
    grade: d.grade,
    status: d.status,
    status_error: d.status_error,
    has_embeddings: d.has_embeddings,
    embedding: embeddingProgress(d),
    page_count: d.page_count,
    chunk_count: d.chunk_count,
    visibility: d.visibility,
    owner_id: d.owner_id,
    created_at: d.created_at,
    updated_at: d.updated_at,
  }));

  return NextResponse.json({
    textbooks,
    currentUserId: user?.id ?? null,
  });
}

