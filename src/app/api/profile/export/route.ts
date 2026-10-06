import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { COL, getDb } from "@/lib/mongo";
import { toPlanRow, type PlanDoc } from "@/lib/plans-repo";

export const runtime = "nodejs";

/**
 * Выгрузка своих данных: профиль, планы, история правок, учебники, лайки,
 * домашние выдачи с результатами учеников и история биллинга.
 *
 * Набор был неполным: отсутствовали выдачи с именами учеников, учебники,
 * версии планов и события биллинга — то есть выгрузить «всё моё» было нельзя.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  try {
    const db = await getDb();
    const [userDoc, plans, versions, textbooks, likes, assignments, attempts, planEvents] = await Promise.all([
      db.collection(COL.users).findOne(
        { email: user.email },
        { projection: { email: 1, full_name: 1, created_at: 1, plan: 1, plan_expires_at: 1 } },
      ),
      db.collection<PlanDoc>(COL.plans)
        .find({ owner_id: user.id })
        .sort({ updated_at: -1 })
        .limit(1000)
        .toArray(),
      db.collection(COL.planVersions)
        .find({ owner_id: user.id })
        .sort({ created_at: -1 })
        .limit(2000)
        .toArray(),
      db.collection(COL.textbooks)
        .find({ owner_id: user.id })
        .project<Record<string, unknown>>({ title: 1, subject_id: 1, grade: 1, status: 1, page_count: 1, chunk_count: 1, created_at: 1 })
        .toArray(),
      db.collection(COL.planLikes).find({ user_id: user.id }).toArray(),
      db.collection(COL.assignments).find({ owner_id: user.id }).toArray(),
      // Попытки по выдачам пользователя: имена учеников и их ответы.
      db.collection(COL.assignmentAttempts).find({ owner_id: user.id }).toArray(),
      db.collection(COL.planEvents).find({ user_id: user.id }).sort({ created_at: -1 }).limit(500).toArray(),
    ]);
    if (!userDoc) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
    return NextResponse.json(
      {
        exportedAt: new Date().toISOString(),
        user: {
          email: userDoc.email,
          fullName: userDoc.full_name ?? null,
          createdAt: userDoc.created_at ?? null,
          plan: userDoc.plan ?? "free",
        },
        plans: plans.map((doc) => toPlanRow(doc)),
        planVersions: versions,
        textbooks,
        likes: likes.map((l) => ({ planId: l.plan_id })),
        assignments: assignments.map((a) => ({
          id: a._id?.toString(),
          code: a.code,
          title: a.title,
          subject: a.subject,
          grade: a.grade,
          status: a.status,
          daysValid: a.days_valid,
          attemptsCount: a.attempts_count,
          createdAt: a.created_at,
        })),
        assignmentAttempts: attempts.map((a) => ({
          assignmentId: a.assignment_id,
          studentName: a.student_name,
          score: a.score,
          maxScore: a.max_score,
          attempts: a.attempts,
          submittedAt: a.submitted_at,
        })),
        billing: planEvents,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="mekty-export.json"`,
        },
      },
    );
  } catch {
    return NextResponse.json({ error: "Выгрузка временно недоступна." }, { status: 503 });
  }
}
