import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAuth } from '@/lib/api-auth';
import { checkRateLimitAsync } from '@/lib/rate-limit';
import { startAgentTask, listAgentTasks, maybeDispatchQueuedFromRequest } from '@/lib/agents/orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const createSchema = z.object({
  prompt: z.string().trim().min(3).max(4000),
  schoolId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
});

/** POST — запустить реальную задачу агента. */
export async function POST(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const rate = await checkRateLimitAsync(`agent:task:${auth.user.id}`, 5, 60_000);
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'Слишком много запусков агента. Подождите минуту.' },
      { status: 429 },
    );
  }

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
    const started = await startAgentTask(auth.user.id, parsed.data.schoolId ?? null, parsed.data.prompt);
    // Если активная задача ещё бежит, новое поручение встаёт в очередь (202).
    return NextResponse.json(
      { taskId: started.id, status: started.status },
      { status: started.status === 'queued' ? 202 : 201 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'AGENT_TASK_ALREADY_RUNNING') {
      return NextResponse.json(
        { error: 'У вас уже выполняется задача агента. Дождитесь её завершения.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'Не удалось запустить агента. Попробуйте позже.' }, { status: 500 });
  }
}

/** GET — список последних задач пользователя. */
export async function GET() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  try {
    // «Будильник» очереди: любой активный запрос запускает следующую queued-
    // задачу, если слот свободен (атомарная защита от дублей).
    await maybeDispatchQueuedFromRequest(auth.user.id).catch(() => {});
    const tasks = await listAgentTasks(auth.user.id);
    return NextResponse.json({ tasks }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Не удалось загрузить задачи' }, { status: 503 });
  }
}
