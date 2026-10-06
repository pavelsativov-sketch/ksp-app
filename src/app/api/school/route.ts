import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { getUserSchools, createSchool } from '@/lib/school';
import { z } from 'zod';

const createSchoolSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(3),
  region: z.string().min(2),
  city: z.string().min(2),
  academic_year: z.string(),
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
    return NextResponse.json({ schools });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    return NextResponse.json({ error: message }, { status: 401 });
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
