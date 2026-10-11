import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { getUserSchools, createSchool } from '@/lib/school';
import { ACTIVE_SCHOOL_COOKIE } from '@/lib/school/active';
import { z } from 'zod';

const createSchoolSchema = z.object({
  name: z.string().min(2),
  code: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9-]+$/).transform(value => value.toUpperCase()),
  region: z.string().min(2),
  city: z.string().min(2),
  academic_year: z.string().trim().regex(/^\d{4}-\d{4}$/),
  settings: z.object({
    language: z.enum(['ru', 'kk']),
    shifts: z.number().min(1).max(2),
    grading_system: z.enum(['5-point', '10-point']),
  })
});

export async function GET(_request: Request) {
  try {
    const authResult = await requireApiAuth();
    if (authResult.response) return authResult.response;
    const user = authResult.user;
    const schools = await getUserSchools(user.id);
    const requested = (await import('next/headers')).cookies;
    const selectedId = (await requested()).get(ACTIVE_SCHOOL_COOKIE)?.value;
    const activeSchoolId = schools.some(school => school._id?.toString() === selectedId)
      ? selectedId
      : [...schools].sort((a, b) => a.name.localeCompare(b.name, 'ru'))[0]?._id?.toString() ?? null;
    return NextResponse.json({ schools, activeSchoolId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function PATCH(req: Request) {
  try {
    const authResult = await requireApiAuth();
    if (authResult.response) return authResult.response;
    const body = await req.json().catch(() => null) as { schoolId?: unknown } | null;
    if (typeof body?.schoolId !== 'string' || !/^[a-f\d]{24}$/i.test(body.schoolId)) {
      return NextResponse.json({ error: 'Некорректная школа' }, { status: 400 });
    }
    await (await import('@/lib/school')).requireSchoolAccess(authResult.user.id, body.schoolId);
    const cookieStore = await (await import('next/headers')).cookies();
    cookieStore.set(ACTIVE_SCHOOL_COOKIE, body.schoolId, {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
      path: '/', maxAge: 60 * 60 * 24 * 30,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Не удалось выбрать школу' }, { status: 403 });
  }
}

export async function POST(req: Request) {
  try {
    const authResult = await requireApiAuth();
    if (authResult.response) return authResult.response;
    const user = authResult.user;
    const body = await req.json();
    
    const parseResult = createSchoolSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid data', details: parseResult.error }, { status: 400 });
    }

    const schoolId = await createSchool(parseResult.data, user.id);
    return NextResponse.json({ id: schoolId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    if (message.includes('E11000')) {
      return NextResponse.json({ error: 'School code must be unique' }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
