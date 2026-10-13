import { NextResponse } from "next/server";
import { getDb, COL, isMongoConfigured, toObjectId } from "@/lib/mongo";
import { requireApiAuth } from "@/lib/api-auth";
import { getSubjectByName, type PlanDoc } from "@/lib/plans-repo";

export const runtime = "nodejs";

/**
 * GET /api/plans/recent?grade=7&subjectId=...&excludeId=...
 * Возвращает последние планы текущего учителя по выбранному классу и предмету
 * для преемственности КТП (связка с темой и домашним заданием предыдущего урока).
 */
export async function GET(request: Request) {
  if (!isMongoConfigured()) {
    return NextResponse.json({ plans: [] });
  }
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const gradeParam = Number(url.searchParams.get("grade") || "");
  let subjectId = url.searchParams.get("subjectId")?.trim() || null;
  const subjectName = url.searchParams.get("subject")?.trim() || null;
  const excludeId = url.searchParams.get("excludeId")?.trim() || null;

  if (!subjectId && subjectName) {
    const resolved = await getSubjectByName(subjectName).catch(() => null);
    if (resolved) subjectId = resolved.id;
  }

  const filter: Record<string, unknown> = { owner_id: auth.user.id };
  if (Number.isInteger(gradeParam) && gradeParam >= 1 && gradeParam <= 11) {
    filter.grade = gradeParam;
  }
  if (subjectId) {
    filter.subject_id = subjectId;
  }
  if (excludeId) {
    const oid = toObjectId(excludeId);
    if (oid) filter._id = { $ne: oid };
  }

  try {
    const db = await getDb();
    const docs = await db
      .collection<PlanDoc>(COL.plans)
      .find(filter, {
        projection: {
          title: 1,
          grade: 1,
          subject_id: 1,
          quarter: 1,
          section: 1,
          language: 1,
          "content.topic": 1,
          "content.stages.end.homework": 1,
          updated_at: 1,
        },
      })
      .sort({ updated_at: -1 })
      .limit(8)
      .toArray();

    const plans = docs
      .map((d) => ({
        id: d._id ? d._id.toString() : "",
        title: d.title || "",
        topic: d.content?.topic || d.title || "",
        section: d.section || null,
        quarter: d.quarter ?? null,
        homework: d.content?.stages?.end?.homework || "",
        updated_at: d.updated_at ? d.updated_at.toISOString() : "",
      }))
      .filter((p) => p.topic.trim().length > 0);

    return NextResponse.json({ plans });
  } catch (e) {
    console.warn("Failed to load recent plans:", e);
    return NextResponse.json({ plans: [] });
  }
}
