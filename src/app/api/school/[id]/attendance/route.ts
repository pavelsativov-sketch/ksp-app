import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { requireSchoolAccess } from '@/lib/school';
import { getAttendanceSummary, getAttendanceByClass } from '@/lib/school-analytics';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireApiAuth();
    if (authResult.response) return authResult.response;
    const user = authResult.user;
    const { id } = await ctx.params;
    
    await requireSchoolAccess(user.id, id);
    const url = new URL(req.url);
    const from = url.searchParams.get('from') || '2026-09-01';
    const to = url.searchParams.get('to') || '2026-09-30';
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
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
