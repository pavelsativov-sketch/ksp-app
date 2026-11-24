import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth, parseJsonBody } from "@/lib/api-handler";
import { COL, getDb, toObjectId } from "@/lib/mongo";
import { createDirectAssignment, type AttemptDoc } from "@/lib/assignments";
import {
  sorSochWorkSchema,
  sorVariantToInteractiveTasks,
  type SorSochWork,
} from "@/lib/ai/sor-soch-generator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SorOnlineMeta {
  v1Id: string;
  v1Code: string;
  v2Id: string;
  v2Code: string;
  issuedAt: string;
}

const assignPostSchema = z.object({
  workId: z.string().regex(/^[0-9a-f]{24}$/i).optional(),
  work: sorSochWorkSchema,
  daysValid: z.coerce.number().int().min(1).max(60).default(14),
});

export const POST = withApiAuth(
  {
    rateLimit: { prefix: "sor-soch:assign", limit: 20, windowMs: 60_000 },
    errorMessage: "Не удалось выдать СОР/СОЧ по коду",
  },
  async ({ req, user }) => {
    const parsed = await parseJsonBody(req, assignPostSchema);
    if (parsed.error) return parsed.error;
    const { workId, work, daysValid } = parsed.data;

    const tasksV1 = sorVariantToInteractiveTasks(work, 1);
    const tasksV2 = sorVariantToInteractiveTasks(work, 2);
    const isKz = work.language === "kz";

    const v1Title = `${work.workType}: ${work.subject} (${work.grade}) — ${isKz ? "1-нұсқа" : "Вариант 1"}`.slice(0, 200);
    const v2Title = `${work.workType}: ${work.subject} (${work.grade}) — ${isKz ? "2-нұсқа" : "Вариант 2"}`.slice(0, 200);

    const [v1, v2] = await Promise.all([
      createDirectAssignment(user.id, {
        title: v1Title,
        subject: work.subject,
        grade: work.grade,
        tasks: tasksV1,
        feedbackMode: "none",
        daysValid,
        source: { ...(workId ? { sorSochWorkId: workId } : {}), variant: 1 },
      }),
      createDirectAssignment(user.id, {
        title: v2Title,
        subject: work.subject,
        grade: work.grade,
        tasks: tasksV2,
        feedbackMode: "none",
        daysValid,
        source: { ...(workId ? { sorSochWorkId: workId } : {}), variant: 2 },
      }),
    ]);

    const online: SorOnlineMeta = {
      v1Id: v1.id,
      v1Code: v1.code,
      v2Id: v2.id,
      v2Code: v2.code,
      issuedAt: new Date().toISOString(),
    };

    const db = await getDb();
    let persistedWorkId = workId;
    if (workId) {
      const oid = toObjectId(workId);
      if (oid) {
        await db.collection(COL.sorSochWorks).updateOne(
          { _id: oid, owner_id: user.id },
          { $set: { online } },
        );
      }
    } else {
      const inserted = await db.collection(COL.sorSochWorks).insertOne({
        owner_id: user.id,
        work,
        online,
        created_at: new Date(),
      });
      persistedWorkId = inserted.insertedId.toHexString();
    }

    return NextResponse.json({
      ok: true,
      workId: persistedWorkId,
      online,
    });
  },
);

export const GET = withApiAuth(
  {
    rateLimit: { prefix: "sor-soch:online-scores", limit: 60, windowMs: 60_000 },
    errorMessage: "Не удалось загрузить онлайн-результаты СОР/СОЧ",
  },
  async ({ user }) => {
    const db = await getDb();
    const docs = await db
      .collection<{
        owner_id: string;
        work: SorSochWork;
        online?: SorOnlineMeta;
        created_at: Date;
      }>(COL.sorSochWorks)
      .find({ owner_id: user.id, online: { $exists: true } })
      .sort({ created_at: -1 })
      .limit(12)
      .toArray();

    const assignmentIds = docs.flatMap((d) =>
      d.online ? [d.online.v1Id, d.online.v2Id] : [],
    );

    const attempts =
      assignmentIds.length > 0
        ? await db
            .collection<AttemptDoc>(COL.assignmentAttempts)
            .find({
              owner_id: user.id,
              assignment_id: { $in: assignmentIds },
            })
            .sort({ created_at: 1 })
            .toArray()
        : [];

    const byAssignment = new Map<string, AttemptDoc[]>();
    for (const att of attempts) {
      const list = byAssignment.get(att.assignment_id) ?? [];
      list.push(att);
      byAssignment.set(att.assignment_id, list);
    }

    const sessions = docs
      .filter((d) => Boolean(d.online))
      .map((d) => {
        const online = d.online!;
        const v1List = byAssignment.get(online.v1Id) ?? [];
        const v2List = byAssignment.get(online.v2Id) ?? [];
        const students = [
          ...v1List.map((a) => ({
            name: a.student_name,
            variant: 1 as const,
            score: a.score,
            maxScore: a.max_score,
          })),
          ...v2List.map((a) => ({
            name: a.student_name,
            variant: 2 as const,
            score: a.score,
            maxScore: a.max_score,
          })),
        ];
        return {
          workId: String((d as { _id?: unknown })._id ?? ""),
          title: d.work.title,
          subject: d.work.subject,
          grade: d.work.grade,
          quarter: d.work.quarter,
          workType: d.work.workType,
          maxPoints: d.work.maxPoints,
          sectionOrTopic: d.work.sectionOrTopic,
          online,
          attemptsCount: students.length,
          scores: students.map((s) => s.score),
          students,
        };
      });

    return NextResponse.json({ sessions }, { headers: { "Cache-Control": "no-store" } });
  },
);
