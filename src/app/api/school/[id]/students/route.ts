import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/api-auth';
import { requireSchoolAccess, getSchoolStudents, addStudents } from '@/lib/school';
import { getAssignedSchoolClassNames, requireSchoolClassAccess } from '@/lib/school-permissions';
import { hasSchoolPermission } from '@/lib/school/role-matrix';

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
    
    const member = await requireSchoolAccess(user.id, id);
    const url = new URL(req.url);
    const classFilter = url.searchParams.get('class') || undefined;
    const includeInactive = url.searchParams.get('includeInactive') === 'true';
    const canReadAll = hasSchoolPermission(member.role, member.granted_permissions, 'school:students:read_all');
    const allowedClasses = canReadAll ? undefined : hasSchoolPermission(member.role, member.granted_permissions, 'school:students:read_assigned')
      ? await getAssignedSchoolClassNames(id, user.id)
      : [];
    if (classFilter && !canReadAll && !allowedClasses?.includes(classFilter)) {
      return NextResponse.json({ error: 'Access denied: class is not assigned' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
    }
    const students = await getSchoolStudents(id, classFilter, includeInactive, allowedClasses);

    return NextResponse.json({ students }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка";
    return NextResponse.json({ error: message }, { status: message.startsWith('Access denied') ? 403 : 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

/** Добавить ученика (учитель школы и выше). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireApiAuth();
    if (authResult.response) return authResult.response;
    const user = authResult.user;
    const { id } = await ctx.params;

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

    await requireSchoolClassAccess(user.id, id, parsed.data.class_name, 'write');

    const count = await addStudents(id, [{ ...parsed.data, status: "active" as const }]);
    return NextResponse.json({ ok: true, added: count }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка";
    return NextResponse.json({ error: message }, { status: message.startsWith('Access denied') ? 403 : 500 });
  }
}
