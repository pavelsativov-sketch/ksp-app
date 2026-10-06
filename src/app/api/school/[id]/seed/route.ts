import { NextResponse } from 'next/server';
import { getDb, COL } from '@/lib/mongo';
import { requireApiAuth } from '@/lib/api-auth';
import { requireSchoolAccess } from '@/lib/school';
import { generateDemoSchoolData } from '@/lib/school-seed';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Наполнение школы демонстрационными данными (учителя, ученики,
 * посещаемость, оценки, КТП, ВШК). Директор, однократно: если ученики
 * уже есть — отказ, чтобы не дублировать 500 детей.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const { id } = await ctx.params;
  if (!/^[a-f\d]{24}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  try {
    await requireSchoolAccess(auth.user.id, id, 'director');
    const db = await getDb();
    const existing = await db.collection(COL.students).countDocuments({ school_id: id });
    if (existing > 0) {
      return NextResponse.json({ error: 'В школе уже есть данные — наполнение недоступно' }, { status: 409 });
    }
    await generateDemoSchoolData(id, auth.user.id);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
