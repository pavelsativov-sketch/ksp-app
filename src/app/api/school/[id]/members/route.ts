import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/api-auth';
import { requireSchoolAccess, getSchoolMembers, addSchoolMember } from '@/lib/school';
import { changeSchoolMemberRole, removeSchoolMember, requireSchoolPermission } from '@/lib/school-permissions';
import { hasSchoolPermission, SCHOOL_ADMIN_FORBIDDEN_PERMISSIONS, SCHOOL_PERMISSIONS } from '@/lib/school/role-matrix';
import { COL, getDb, toObjectId } from '@/lib/mongo';

// Роль не принимается из запроса произвольно: enum задаёт допустимые значения.
const addMemberSchema = z.object({
  user_id: z.string().min(1).max(128),
  role: z.enum(['deputy', 'teacher', 'admin']),
  full_name: z.string().trim().min(1).max(200),
  subject: z.string().trim().max(200).optional(),
  granted_permissions: z.array(z.enum(SCHOOL_PERMISSIONS)).max(SCHOOL_PERMISSIONS.length).optional(),
}).superRefine((value, context) => {
  if (value.role !== 'admin' && value.granted_permissions?.length) {
    context.addIssue({ code: 'custom', path: ['granted_permissions'], message: 'Only school admins may receive explicit permission grants' });
  }
  if (value.role === 'admin' && value.granted_permissions?.some((permission) => SCHOOL_ADMIN_FORBIDDEN_PERMISSIONS.includes(permission))) {
    context.addIssue({ code: 'custom', path: ['granted_permissions'], message: 'School admins cannot receive pedagogical review permissions' });
  }
});
const updateMemberSchema = z.object({
  user_id: z.string().min(1).max(128),
  role: z.enum(['deputy', 'teacher', 'admin']),
  granted_permissions: z.array(z.enum(SCHOOL_PERMISSIONS)).max(SCHOOL_PERMISSIONS.length).optional(),
}).superRefine((value, context) => {
  if (value.role !== 'admin' && value.granted_permissions?.length) {
    context.addIssue({ code: 'custom', path: ['granted_permissions'], message: 'Only school admins may receive explicit permission grants' });
  }
  if (value.role === 'admin' && value.granted_permissions?.some((permission) => SCHOOL_ADMIN_FORBIDDEN_PERMISSIONS.includes(permission))) {
    context.addIssue({ code: 'custom', path: ['granted_permissions'], message: 'School admins cannot receive pedagogical review permissions' });
  }
});
const removeMemberSchema = z.object({ user_id: z.string().min(1).max(128) });

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireApiAuth();
    if (authResult.response) return authResult.response;
    const user = authResult.user;
    const { id } = await ctx.params;
    
    const member = await requireSchoolAccess(user.id, id);
    const members = hasSchoolPermission(member.role, member.granted_permissions, 'school:members:list')
      ? await getSchoolMembers(id)
      : [member];

    return NextResponse.json({ members }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка";
    return NextResponse.json({ error: message }, { status: message.startsWith('Access denied') ? 403 : 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireApiAuth();
    if (authResult.response) return authResult.response;
    const user = authResult.user;
    const { id } = await ctx.params;
    
    await requireSchoolPermission(user.id, id, 'school:members:manage');
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
    if (parsed.data.user_id === user.id) {
      return NextResponse.json({ error: 'A director cannot change their own role by adding themselves' }, { status: 403 });
    }
    const accountId = toObjectId(parsed.data.user_id);
    if (!accountId) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const account = await (await getDb()).collection(COL.users).findOne({ _id: accountId }, { projection: { full_name: 1 } });
    if (!account) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const memberId = await addSchoolMember(id, {
      ...parsed.data,
      full_name: typeof account.full_name === 'string' && account.full_name.trim() ? account.full_name : parsed.data.full_name,
    }, user.id);
    return NextResponse.json({ id: memberId }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка";
    const duplicate = error instanceof Error && (error as Error & { code?: number }).code === 11000;
    return NextResponse.json({ error: duplicate ? 'User is already a member of this school' : message }, {
      status: message.startsWith('Access denied') ? 403 : duplicate ? 409 : 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authResult = await requireApiAuth();
  if (authResult.response) return authResult.response;
  try {
    const { id } = await ctx.params;
    const parsed = updateMemberSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    await changeSchoolMemberRole(authResult.user.id, id, parsed.data.user_id, parsed.data.role, parsed.data.granted_permissions ?? []);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    return NextResponse.json({ error: message }, { status: message.startsWith('Access denied') ? 403 : message.includes('not found') ? 404 : 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authResult = await requireApiAuth();
  if (authResult.response) return authResult.response;
  try {
    const { id } = await ctx.params;
    const parsed = removeMemberSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    await removeSchoolMember(authResult.user.id, id, parsed.data.user_id);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    return NextResponse.json({ error: message }, { status: message.startsWith('Access denied') ? 403 : message.includes('not found') ? 404 : 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
