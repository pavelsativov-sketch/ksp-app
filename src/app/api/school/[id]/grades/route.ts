import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { getSchoolStudentClass, getSchoolStudents, requireSchoolAccess } from '@/lib/school';
import { getQualityMetrics } from '@/lib/school-analytics';
import { getDb, COL } from '@/lib/mongo';
import type { GradeRecord } from '@/lib/school-analytics';
import { getAssignedSchoolClassNames, requireSchoolClassAccess } from '@/lib/school-permissions';
import { hasSchoolPermission } from '@/lib/school/role-matrix';
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
    
    const member = await requireSchoolAccess(user.id, id);
    const canReadAll = hasSchoolPermission(member.role, member.granted_permissions, 'school:students:read_all');
    const allowedClasses = canReadAll ? undefined : hasSchoolPermission(member.role, member.granted_permissions, 'school:students:read_assigned')
      ? await getAssignedSchoolClassNames(id, user.id)
      : [];
    const url = new URL(req.url);
    const quarterStr = url.searchParams.get('quarter');
    const quarter = quarterStr ? parseInt(quarterStr, 10) : undefined;
    
    const className = url.searchParams.get('class') || undefined;
    if (className && !canReadAll && !allowedClasses?.includes(className)) {
      return NextResponse.json({ error: 'Access denied: class is not assigned' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
    }
    if (className) await requireSchoolClassAccess(user.id, id, className, 'read');
    const grades = await getQualityMetrics(id, quarter, className ? [className] : allowedClasses);

    return NextResponse.json({ grades }, { headers: { 'Cache-Control': 'private, no-store' } });
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
    const input = gradeSchema.safeParse(await req.json());
    if (!input.success) return NextResponse.json({ error: 'Проверьте данные оценки.' }, { status: 400 });
    const data = input.data;
    if (data.score > data.maxScore) return NextResponse.json({ error: 'Оценка не может быть выше максимального балла.' }, { status: 400 });
    const date = new Date(`${data.date}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== data.date) return NextResponse.json({ error: 'Некорректная дата.' }, { status: 400 });
    const studentClass = await getSchoolStudentClass(id, data.studentId.toLowerCase());
    if (!studentClass) return NextResponse.json({ error: 'Учащийся не найден в этой школе.' }, { status: 404 });
    await requireSchoolClassAccess(auth.user.id, id, studentClass, 'write');
    const student = (await getSchoolStudents(id, studentClass, true)).find((item) => item._id?.toString() === data.studentId.toLowerCase());
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
