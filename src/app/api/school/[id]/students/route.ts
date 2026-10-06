import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/api-auth';
import { requireSchoolAccess, getSchoolStudents, addStudents } from '@/lib/school';

const addStudentSchema = z.object({
  full_name: z.string().trim().min(2).max(200),
  class_name: z.string().trim().min(1).max(10),
  class_grade: z.coerce.number().int().min(1).max(12),
  gender: z.enum(['M', 'F']),
  birth_date: z.string().max(20).optional(),
  iin_last4: z.string().max(4).optional(),
});

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireApiAuth();
    if (authResult.response) return authResult.response;
    const user = authResult.user;
    const { id } = await ctx.params;
    
    await requireSchoolAccess(user.id, id);
    const url = new URL(req.url);
    const classFilter = url.searchParams.get('class') || undefined;
    
    const students = await getSchoolStudents(id, classFilter);

    return NextResponse.json({ students });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/** Добавить ученика (учитель школы и выше). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireApiAuth();
    if (authResult.response) return authResult.response;
    const user = authResult.user;
    const { id } = await ctx.params;

    await requireSchoolAccess(user.id, id, 'teacher');
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parsed = addStudentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Проверьте поля: имя, класс (1–12), пол' }, { status: 400 });
    }

    const count = await addStudents(id, [{ ...parsed.data, status: "active" as const }]);
    return NextResponse.json({ ok: true, added: count }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
