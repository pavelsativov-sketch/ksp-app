import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { requireSchoolAccess } from '@/lib/school';
import { getCurriculumProgress } from '@/lib/school-analytics';
import { getDb, COL } from '@/lib/mongo';
import { z } from 'zod';

const createSchema = z.object({
  subject: z.string().trim().min(1).max(120),
  className: z.string().trim().min(1).max(20),
  academicYear: z.string().trim().regex(/^\d{4}-\d{4}$/),
  topics: z.array(z.string().trim().min(1).max(300)).min(1).max(200),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().default(''),
});

const lessonSchema = z.object({
  curriculumId: z.string().regex(/^[a-f\d]{24}$/i),
  lessonNumber: z.coerce.number().int().min(1).max(200),
  status: z.enum(['planned', 'completed', 'skipped', 'rescheduled']),
  actualDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireApiAuth();
    if (authResult.response) return authResult.response;
    const user = authResult.user;
    const { id } = await ctx.params;
    
    await requireSchoolAccess(user.id, id);
    const progress = await getCurriculumProgress(id);

    return NextResponse.json({ progress });
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
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: 'Проверьте предмет, класс, учебный год и список тем.' }, { status: 400 });
    const { subject, className, academicYear, topics, startDate } = parsed.data;
    const start = startDate ? new Date(`${startDate}T00:00:00.000Z`) : null;
    if (startDate && (Number.isNaN(start!.getTime()) || start!.toISOString().slice(0, 10) !== startDate)) return NextResponse.json({ error: 'Некорректная дата начала.' }, { status: 400 });
    const lessons = topics.map((topic, index) => {
      const planned = start ? new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10) : '';
      return { number: index + 1, topic, planned_date: planned, status: 'planned' as const };
    });
    const db = await getDb();
    const now = new Date();
    const result = await db.collection(COL.curriculum).insertOne({ school_id: id, teacher_id: auth.user.id, subject, class_name: className, academic_year: academicYear, total_hours: lessons.length, lessons, created_at: now, updated_at: now });
    return NextResponse.json({ ok: true, plan: { id: result.insertedId.toString(), subject, class_name: className, academic_year: academicYear, total_hours: lessons.length, lessons } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось сохранить программу.';
    return NextResponse.json({ error: message }, { status: message.includes('Access denied') ? 403 : 500 });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const { id } = await ctx.params;
  try {
    await requireSchoolAccess(auth.user.id, id, 'teacher');
    const parsed = lessonSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: 'Некорректный статус урока.' }, { status: 400 });
    const input = parsed.data;
    const date = input.actualDate ? new Date(`${input.actualDate}T00:00:00.000Z`) : null;
    if (input.actualDate && (Number.isNaN(date!.getTime()) || date!.toISOString().slice(0, 10) !== input.actualDate)) return NextResponse.json({ error: 'Некорректная дата урока.' }, { status: 400 });
    const { ObjectId } = await import('mongodb');
    const collection = (await getDb()).collection(COL.curriculum);
    const update = input.status === 'completed'
      ? { $set: { 'lessons.$.status': input.status, 'lessons.$.actual_date': input.actualDate ?? new Date().toISOString().slice(0, 10), updated_at: new Date() } }
      : { $set: { 'lessons.$.status': input.status, updated_at: new Date() }, $unset: { 'lessons.$.actual_date': '' } };
    const result = await collection.updateOne(
      { _id: new ObjectId(input.curriculumId), school_id: id, 'lessons.number': input.lessonNumber },
      update,
    );
    if (result.matchedCount === 0) return NextResponse.json({ error: 'Учебная программа или урок не найдены.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось обновить урок.';
    return NextResponse.json({ error: message }, { status: message.includes('Access denied') ? 403 : 500 });
  }
}
