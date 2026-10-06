import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { requireSchoolAccess } from '@/lib/school';
import { getQualityMetrics } from '@/lib/school-analytics';

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
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
