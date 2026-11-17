import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth, parseJsonBody } from "@/lib/api-handler";
import { getActiveSchool } from "@/lib/school/active";
import {
  addJournalStudents,
  deleteJournalStudent,
  getJournalState,
  importAssignmentToJournal,
  setJournalCell,
  syncRosterFromHomework,
} from "@/lib/journal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiAuth(
  {
    rateLimit: { prefix: "journal:read", limit: 120, windowMs: 60_000 },
    errorMessage: "Не удалось загрузить электронный журнал",
  },
  async ({ req, user }) => {
    const url = new URL(req.url);
    const className = url.searchParams.get("className") || undefined;
    const subject = url.searchParams.get("subject") || undefined;
    const syncHomework = url.searchParams.get("sync") !== "0";

    const school = await getActiveSchool(user.id).catch(() => null);
    const state = await getJournalState(user.id, {
      schoolId: school?._id?.toString() ?? null,
      syncHomework,
      className,
      subject,
    });

    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  },
);

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add-students"),
    className: z.string().trim().min(1).max(32),
    names: z.array(z.string().trim().min(2).max(100)).min(1).max(80),
  }),
  z.object({
    action: z.literal("set-cell"),
    studentId: z.string().regex(/^[0-9a-f]{24}$/i),
    subject: z.string().trim().min(1).max(80),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    score: z.number().int().min(1).max(10).nullable().optional(),
    attendance: z.enum(["excused", "unexcused", "sick"]).nullable().optional(),
    note: z.string().max(200).optional(),
  }),
  z.object({
    action: z.literal("sync-roster"),
  }),
  z.object({
    action: z.literal("import-assignment"),
    assignmentId: z.string().regex(/^[0-9a-f]{24}$/i),
    className: z.string().trim().max(32).optional(),
    subject: z.string().trim().max(80).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
]);

export const POST = withApiAuth(
  {
    rateLimit: { prefix: "journal:write", limit: 180, windowMs: 60_000 },
    errorMessage: "Не удалось сохранить данные в электронный журнал",
  },
  async ({ req, user }) => {
    const parsed = await parseJsonBody(req, postSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    if (body.action === "add-students") {
      const school = await getActiveSchool(user.id).catch(() => null);
      const res = await addJournalStudents(user.id, {
        className: body.className,
        names: body.names,
        schoolId: school?._id?.toString() ?? null,
      });
      return NextResponse.json({ ok: true, ...res });
    }

    if (body.action === "set-cell") {
      await setJournalCell(user.id, body);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "sync-roster") {
      const school = await getActiveSchool(user.id).catch(() => null);
      const res = await syncRosterFromHomework(user.id, school?._id?.toString() ?? null);
      return NextResponse.json({ ok: true, ...res });
    }

    const imported = await importAssignmentToJournal(user.id, body);
    return NextResponse.json({ ok: true, ...imported });
  },
);

const deleteSchema = z.object({
  studentId: z.string().regex(/^[0-9a-f]{24}$/i),
});

export const DELETE = withApiAuth(
  {
    rateLimit: { prefix: "journal:delete", limit: 60, windowMs: 60_000 },
    errorMessage: "Не удалось удалить ученика из журнала",
  },
  async ({ req, user }) => {
    const parsed = await parseJsonBody(req, deleteSchema);
    if (parsed.error) return parsed.error;
    const deleted = await deleteJournalStudent(user.id, parsed.data.studentId);
    return NextResponse.json({ ok: true, deleted });
  },
);
