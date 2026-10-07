import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { requireSchoolAccess } from '@/lib/school';
import { getAttendanceSummary, getAttendanceByClass } from '@/lib/school-analytics';
import { getDb, COL } from '@/lib/mongo';
import { getSchoolStudents } from '@/lib/school';
import type { AttendanceRecord } from '@/lib/school-analytics';
import { z } from 'zod';

const attendanceSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  className: z.string().trim().min(1).max(20),
  marks: z.array(z.object({ studentId: z.string().regex(/^[a-f\d]{24}$/i), status: z.enum(['present', 'absent_excused', 'absent_unexcused', 'late']) })).min(1).max(100),
});

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireApiAuth();
    if (authResult.response) return authResult.response;
    const user = authResult.user;
    const { id } = await ctx.params;
    
    await requireSchoolAccess(user.id, id);
    const url = new URL(req.url);
    const today = new Date().toISOString().slice(0, 10);
    const from = url.searchParams.get('from') || `${today.slice(0, 7)}-01`;
    const to = url.searchParams.get('to') || today;
    const className = url.searchParams.get('class');
    
    if (className) {
      const attendance = await getAttendanceByClass(id, className, from, to);
      return NextResponse.json({ attendance });
    } else {
      const summary = await getAttendanceSummary(id, from, to);
      return NextResponse.json({ summary });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка";
    return NextResponse.json({ error: message }, { status: message.includes('Access denied') ? 403 : 500 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const { id } = await ctx.params;
  try {
    await requireSchoolAccess(auth.user.id, id, 'teacher');
    const input = attendanceSchema.safeParse(await req.json());
    if (!input.success) return NextResponse.json({ error: 'Проверьте дату, класс и отметки учащихся.' }, { status: 400 });
    const { date, className, marks } = input.data;
    const dateValue = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(dateValue.getTime()) || dateValue.toISOString().slice(0, 10) !== date) {
      return NextResponse.json({ error: 'Некорректная дата.' }, { status: 400 });
    }
    const ids = marks.map((mark) => mark.studentId.toLowerCase());
    if (new Set(ids).size !== ids.length) return NextResponse.json({ error: 'Ученик указан несколько раз.' }, { status: 400 });
    const roster = await getSchoolStudents(id, className);
    const byId = new Map(roster.filter((student) => student._id).map((student) => [student._id!.toString(), student]));
    if (ids.some((studentId) => !byId.has(studentId))) return NextResponse.json({ error: 'Список содержит ученика не из выбранного класса.' }, { status: 400 });
    const db = await getDb();
    const now = new Date();
    for (const mark of marks) {
      const student = byId.get(mark.studentId.toLowerCase())!;
      const record = { school_id: id, student_id: mark.studentId.toLowerCase(), student_name: student.full_name, class_name: className, date, status: mark.status, recorded_by: auth.user.id };
      await db.collection<AttendanceRecord>(COL.attendance).updateOne(
        { school_id: id, student_id: record.student_id, date },
        { $set: { ...record, updated_at: now }, $setOnInsert: { created_at: now } },
        { upsert: true },
      );
    }
    return NextResponse.json({ ok: true, saved: marks.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось сохранить посещаемость.';
    return NextResponse.json({ error: message }, { status: message.includes('Access denied') ? 403 : 500 });
  }
}
