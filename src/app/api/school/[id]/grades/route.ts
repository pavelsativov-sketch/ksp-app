import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { requireSchoolAccess } from '@/lib/school';
import { getQualityMetrics } from '@/lib/school-analytics';
import { getDb, COL } from '@/lib/mongo';
import { getSchoolStudents } from '@/lib/school';
import type { GradeRecord } from '@/lib/school-analytics';
import { z } from 'zod';

const gradeSchema = z.object({
  studentId: z.string().regex(/^[a-f\d]{24}$/i),
  subject: z.string().trim().min(1).max(120),
  quarter: z.coerce.number().int().min(1).max(4),
  type: z.enum(['current', 'sor', 'soch']),
  score: z.coerce.number().finite().min(0),
  maxScore: z.coerce.number().finite().positive(),
  topic: z.string().trim().max(200).optional().default(''),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireApiAuth();
    if (authResult.response) return authResult.response;
    const user = authResult.user;
    const { id } = await ctx.params;
    
    await requireSchoolAccess(user.id, id);
    const url = new URL(req.url);
    const quarterStr = url.searchParams.get('quarter');
    const quarter = quarterStr ? parseInt(quarterStr, 10) : undefined;
    
    const grades = await getQualityMetrics(id, quarter);

    return NextResponse.json({ grades });
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
    const input = gradeSchema.safeParse(await req.json());
    if (!input.success) return NextResponse.json({ error: 'Проверьте данные оценки.' }, { status: 400 });
    const data = input.data;
    if (data.score > data.maxScore) return NextResponse.json({ error: 'Оценка не может быть выше максимального балла.' }, { status: 400 });
    const date = new Date(`${data.date}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== data.date) return NextResponse.json({ error: 'Некорректная дата.' }, { status: 400 });
    const student = (await getSchoolStudents(id)).find((item) => item._id?.toString() === data.studentId.toLowerCase());
    if (!student?._id) return NextResponse.json({ error: 'Учащийся не найден в этой школе.' }, { status: 404 });
    const db = await getDb();
    const result = await db.collection<GradeRecord>(COL.schoolGrades).insertOne({
      school_id: id,
      student_id: student._id.toString(),
      student_name: student.full_name,
      class_name: student.class_name,
      subject: data.subject,
      teacher_id: auth.user.id,
      quarter: data.quarter,
      type: data.type,
      score: data.score,
      max_score: data.maxScore,
      topic: data.topic || undefined,
      date: data.date,
      created_at: new Date(),
    });
    return NextResponse.json({ ok: true, id: result.insertedId.toString() }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось сохранить оценку.';
    return NextResponse.json({ error: message }, { status: message.includes('Access denied') ? 403 : 500 });
  }
}
