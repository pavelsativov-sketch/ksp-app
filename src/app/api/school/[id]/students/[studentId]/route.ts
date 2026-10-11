import { ObjectId } from 'mongodb';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/api-auth';
import { requireSchoolAccess } from '@/lib/school';
import { getDb, COL } from '@/lib/mongo';

const updateStudentSchema = z.object({
  full_name: z.string().trim().min(2).max(200),
  class_name: z.string().trim().min(1).max(10),
  class_grade: z.coerce.number().int().min(1).max(12),
  gender: z.enum(['M', 'F']),
  status: z.enum(['active', 'transferred', 'graduated']),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; studentId: string }> }) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const { id, studentId } = await ctx.params;
  if (!ObjectId.isValid(studentId)) return NextResponse.json({ error: 'Некорректный ID ученика' }, { status: 400 });
  try {
    await requireSchoolAccess(auth.user.id, id, 'teacher');
    const body = await req.json().catch(() => null);
    const parsed = updateStudentSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Проверьте имя, класс, параллель, пол и статус' }, { status: 400 });
    const db = await getDb();
    const result = await db.collection(COL.students).updateOne(
      { _id: new ObjectId(studentId), school_id: id },
      { $set: { ...parsed.data, updated_at: new Date() } },
    );
    if (!result.matchedCount) return NextResponse.json({ error: 'Ученик не найден' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    return NextResponse.json({ error: message }, { status: message.includes('Access denied') ? 403 : 500 });
  }
}
