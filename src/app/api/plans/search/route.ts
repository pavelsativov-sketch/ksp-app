import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getDb, COL, isMongoConfigured } from "@/lib/mongo";
import { checkRateLimitAsync } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * GET /api/plans/search?q=… — поиск по своим планам (заголовок и тема).
 * Только для владельца: чужие планы не участвуют.
 */
export async function GET(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ items: [] });

  const rl = await checkRateLimitAsync(`plans:search:${auth.user.id}`, 60, 3600_000);
  if (!rl.ok) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
  if (!isMongoConfigured()) return NextResponse.json({ items: [] });

  const escaped = escapeRegex(q);
  const db = await getDb();
  const docs = await db
    .collection(COL.plans)
    .find(
      {
        owner_id: auth.user.id,
        $or: [
          { title: { $regex: escaped, $options: "i" } },
          { "content.topic": { $regex: escaped, $options: "i" } },
        ],
      },
      { projection: { title: 1, grade: 1, subject_id: 1, "content.topic": 1, updated_at: 1 } },
    )
    .sort({ updated_at: -1 })
    .limit(20)
    .toArray();

  return NextResponse.json({
    items: docs.map((d) => ({
      id: String(d._id),
      title: d.title,
      grade: d.grade,
      topic: typeof d.content?.topic === "string" ? d.content.topic : null,
      updatedAt: d.updated_at instanceof Date ? d.updated_at.toISOString() : null,
    })),
  });
}
