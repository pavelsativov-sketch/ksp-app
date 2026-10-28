import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { getSchoolById, requireSchoolAccess, getSchoolMembers, getSchoolStudents } from '@/lib/school';
import { hasSchoolPermission } from '@/lib/school/role-matrix';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireApiAuth();
    if (authResult.response) return authResult.response;
    const user = authResult.user;
    const { id } = await ctx.params;
    
    const member = await requireSchoolAccess(user.id, id);
    const school = await getSchoolById(id);
    if (!school) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Списки сотрудников и учеников раскрываются только при наличии явных прав:
    // обычный учитель получает только карточку школы без персональных данных.
    const canListStaff = hasSchoolPermission(member.role, member.granted_permissions, 'school:members:list');
    const canViewAllStudents = hasSchoolPermission(member.role, member.granted_permissions, 'school:students:read_all');
    const members = canListStaff ? await getSchoolMembers(id) : [];
    const students = canViewAllStudents ? await getSchoolStudents(id) : [];

    return NextResponse.json({ 
      school,
      stats: {
        teachersCount: canListStaff ? members.filter(m => m.role === 'teacher').length : null,
        studentsCount: canViewAllStudents ? students.length : null
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
