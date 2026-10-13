import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/api-auth';
import { requireSchoolAccess } from '@/lib/school';
import { requireSchoolClassAccess, requireSchoolPermission } from '@/lib/school-permissions';
import { getVskSummary } from '@/lib/school-analytics';
import { getDb, COL } from '@/lib/mongo';

// Валидация вместо сырого spread: неизвестные поля отбрасываются,
// идентификатор проверяющего берётся из сессии, а не из тела запроса.
const vskSchema = z.object({
  inspector_name: z.string().trim().max(200).optional(),
  teacher_id: z.string().min(1).max(128),
  teacher_name: z.string().trim().max(200).optional(),
  subject: z.string().trim().max(200).optional(),
  class_name: z.string().trim().max(50).optional(),
  date: z.string().max(20).optional(),
  direction: z.string().trim().max(200).optional(),
  checklist: z.array(z.object({
    criterion: z.string().trim().min(1).max(300),
    score: z.number().min(0).max(5),
    max_score: z.number().min(1).max(5),
    comment: z.string().max(500).optional(),
  })).max(30).optional(),
  overall_score: z.number().min(0).max(100),
  findings: z.string().max(2000).optional(),
  recommendations: z.string().max(2000).optional(),
  status: z.enum(['draft', 'completed']).optional(),
});

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireApiAuth();
    if (authResult.response) return authResult.response;
    const user = authResult.user;
    const { id } = await ctx.params;
    
    await requireSchoolPermission(user.id, id, 'school:vsk:read_all');
    const period = new URL(req.url).searchParams.get('period') ?? undefined;
    const vsk = await getVskSummary(id, period);

    return NextResponse.json({ vsk }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка";
    const status = message.includes('Access denied') ? 403 : message.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireApiAuth();
    if (authResult.response) return authResult.response;
    const user = authResult.user;
    const { id } = await ctx.params;
    
    const inspector = await requireSchoolPermission(user.id, id, 'school:vsk:manage');
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parsed = vskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }

    if (!parsed.data.class_name) return NextResponse.json({ error: 'A class is required for a school inspection.' }, { status: 400 });
    const teacher = await requireSchoolAccess(parsed.data.teacher_id, id);
    if (teacher.role !== 'teacher') return NextResponse.json({ error: 'The inspected member must have the teacher role.' }, { status: 400 });
    await requireSchoolClassAccess(teacher.user_id, id, parsed.data.class_name, 'read');

    const db = await getDb();
    const doc = {
      ...parsed.data,
      inspector_name: inspector.full_name,
      teacher_name: teacher.full_name,
      school_id: id,
      inspector_id: user.id,
      created_at: new Date(),
    };

    const result = await db.collection(COL.vskInspections).insertOne(doc);
    return NextResponse.json({ id: result.insertedId.toString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка";
    const status = message.includes('Access denied') ? 403 : message.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
