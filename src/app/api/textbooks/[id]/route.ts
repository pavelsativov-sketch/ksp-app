import { NextResponse } from "next/server";
import { getDb, COL, toObjectId, isMongoConfigured } from "@/lib/mongo";
import { requireApiAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  const { id } = await params;
  const oid = toObjectId(id);
  if (!oid) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const user = auth.user;

  const db = await getDb();
  const tb = await db.collection(COL.textbooks).findOne({ _id: oid });
  if (!tb) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (tb.owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await Promise.all([
    db.collection(COL.textbooks).deleteOne({ _id: oid }),
    db.collection(COL.textbookChunks).deleteMany({ textbook_id: id }),
  ]);

  return NextResponse.json({ ok: true });
}

