import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getDb, COL, isMongoConfigured } from "@/lib/mongo";
import { canViewAiHistory, retentionCutoff, AI_HISTORY_TTL_DAYS, toPublicHistory, type AiHistoryDoc } from "@/lib/ai/history";
import { ObjectId } from "mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const requestedUserId = url.searchParams.get("user_id")?.trim() || auth.user.id;
  const limitRaw = url.searchParams.get("limit");
  const limit = Math.min(100, Math.max(1, limitRaw ? Number(limitRaw) || 20 : 20));
  const skipRaw = url.searchParams.get("skip");
  const skip = Math.max(0, Number(skipRaw) || 0);

  if (!/^[0-9a-f]{24}$/i.test(requestedUserId)) {
    return NextResponse.json({ error: "Invalid user_id" }, { status: 400 });
  }

  const allowed = await canViewAiHistory(auth.user.id, requestedUserId);
  if (!allowed) {
    return NextResponse.json({ error: "Доступ запрещён: только владелец или завуч/директор школы" }, { status: 403 });
  }

  if (!isMongoConfigured()) {
    return NextResponse.json({ items: [], cutoff: retentionCutoff().toISOString(), ttlDays: AI_HISTORY_TTL_DAYS });
  }

  const db = await getDb();
  const cutoff = retentionCutoff();

  const filter: Record<string, unknown> = {
    user_id: requestedUserId,
    createdAt: { $gte: cutoff },
    // history entries have schema_version; skip quota slots (seq)
    schema_version: { $exists: true },
  };

  const docs = await db
    .collection<AiHistoryDoc>(COL.aiEvents)
    .find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();

  const items = docs
    .filter((d) => d._id instanceof ObjectId)
    .map((d) => toPublicHistory(d as AiHistoryDoc & { _id: ObjectId }));

  // total — общее число записей пользователя (не размер страницы), иначе
  // пагинация в UI считала бы «всё» по первой странице.
  const total = await db.collection<AiHistoryDoc>(COL.aiEvents).countDocuments(filter);

  return NextResponse.json(
    { items, cutoff: cutoff.toISOString(), ttlDays: AI_HISTORY_TTL_DAYS, total },
    { headers: { "Cache-Control": "no-store" } },
  );
}
