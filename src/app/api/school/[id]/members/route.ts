import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/api-auth';
import { requireSchoolAccess, getSchoolMembers, addSchoolMember } from '@/lib/school';

// Роль не принимается из запроса произвольно: enum задаёт допустимые значения.
const addMemberSchema = z.object({
  user_id: z.string().min(1).max(128),
  role: z.enum(['deputy', 'teacher']),
  full_name: z.string().trim().min(1).max(200),
  subject: z.string().trim().max(200).optional(),
});

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireApiAuth();
    if (authResult.response) return authResult.response;
    const user = authResult.user;
    const { id } = await ctx.params;
    
    await requireSchoolAccess(user.id, id);
    const members = await getSchoolMembers(id);

    return NextResponse.json({ members });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireApiAuth();
    if (authResult.response) return authResult.response;
    const user = authResult.user;
    const { id } = await ctx.params;
    
    await requireSchoolAccess(user.id, id, 'director');
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parsed = addMemberSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }

    const memberId = await addSchoolMember(id, parsed.data);
    return NextResponse.json({ id: memberId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
