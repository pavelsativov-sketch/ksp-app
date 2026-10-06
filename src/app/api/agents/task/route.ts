import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/api-auth';
import { startAgentTask, listAgentTasks } from '@/lib/agents/orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createSchema = z.object({
  prompt: z.string().trim().min(3).max(4000),
  schoolId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
});

/** POST — запустить реальную задачу агента. */
export async function POST(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Опишите задачу (3–4000 символов)' }, { status: 400 });
  }

  try {
    const taskId = await startAgentTask(auth.user.id, parsed.data.schoolId ?? null, parsed.data.prompt);
    return NextResponse.json({ taskId }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Не удалось запустить агента. Попробуйте позже.' }, { status: 500 });
  }
}

/** GET — список последних задач пользователя. */
export async function GET() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  try {
    const tasks = await listAgentTasks(auth.user.id);
    return NextResponse.json({ tasks }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Не удалось загрузить задачи' }, { status: 503 });
  }
}
