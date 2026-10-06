import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { requireSchoolAccess } from '@/lib/school';
import { getCurriculumProgress } from '@/lib/school-analytics';

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
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
