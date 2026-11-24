import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth, parseJsonBody } from "@/lib/api-handler";
import { COL, getDb, toObjectId } from "@/lib/mongo";
import { createDirectAssignment } from "@/lib/assignments";
import {
  entModoToInteractiveTasks,
  entModoWorkSchema,
} from "@/lib/ai/ent-modo-models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const assignSchema = z.object({
  workId: z.string().regex(/^[0-9a-f]{24}$/i).optional(),
  work: entModoWorkSchema,
  daysValid: z.coerce.number().int().min(1).max(60).default(14),
});

export const POST = withApiAuth(
  {
    rateLimit: { prefix: "ent-modo:assign", limit: 20, windowMs: 60_000 },
    errorMessage: "Не удалось создать онлайн-выдачу варианта ЕНТ/МОДО",
  },
  async ({ req, user }) => {
    const parsed = await parseJsonBody(req, assignSchema);
    if (parsed.error) return parsed.error;
    const { workId, work, daysValid } = parsed.data;

    const tasks = entModoToInteractiveTasks(work);
    const created = await createDirectAssignment(user.id, {
      title: work.title.slice(0, 200),
      subject: work.subject,
      grade: work.grade,
      tasks,
      feedbackMode: "correct_only",
      daysValid,
      source: { ...(workId ? { entModoWorkId: workId } : {}) },
    });

    const online = {
      assignmentId: created.id,
      code: created.code,
      issuedAt: new Date().toISOString(),
    };

    const db = await getDb();
    let persistedId = workId;
    if (workId) {
      const oid = toObjectId(workId);
      if (oid) {
        await db.collection(COL.entModoWorks).updateOne(
          { _id: oid, owner_id: user.id },
          { $set: { online } },
        );
      }
    } else {
      const inserted = await db.collection(COL.entModoWorks).insertOne({
        owner_id: user.id,
        work,
        online,
        created_at: new Date(),
      });
      persistedId = inserted.insertedId.toHexString();
    }

    return NextResponse.json({
      ok: true,
      workId: persistedId,
      online,
    });
  },
);
