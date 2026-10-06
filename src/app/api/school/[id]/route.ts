import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { getSchoolById, requireSchoolAccess, getSchoolMembers, getSchoolStudents } from '@/lib/school';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireApiAuth();
    if (authResult.response) return authResult.response;
    const user = authResult.user;
    const { id } = await ctx.params;
    
    await requireSchoolAccess(user.id, id);
    const school = await getSchoolById(id);
    if (!school) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const members = await getSchoolMembers(id);
    const students = await getSchoolStudents(id);

    return NextResponse.json({ 
      school,
      stats: {
        teachersCount: members.filter(m => m.role === 'teacher').length,
        studentsCount: students.length
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
