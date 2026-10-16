import { ObjectId } from 'mongodb';
import { after } from 'next/server';
import { getDb, COL } from '@/lib/mongo';
import { runAgentTask } from './runner';
import { setControlOwner } from './session';
import { runningTaskIsStale } from './lease';

/**
 * Создаёт задачу агента и запускает реальное выполнение в фоне.
 * schoolId необязателен: агент работает и без школы (личная рабочая область).
 */

export async function startAgentTask(userId: string, schoolId: string | null, prompt: string): Promise<string> {
  const db = await getDb();
  const agentTasks = db.collection(COL.agentTasks);

  const active = await agentTasks.findOne(
    { user_id: new ObjectId(userId), status: 'running' },
    { projection: { _id: 1, heartbeat_at: 1, updated_at: 1, created_at: 1 } },
  );
  if (active && !runningTaskIsStale(active, Date.now())) {
    throw new Error('AGENT_TASK_ALREADY_RUNNING');
  }
  if (active) {
    // Серверлесс-функция раннера погибла (лимит 300 с), а статус остался
    // running и навсегда блокировал новые задачи. Честно закрываем зомби
    // и освобождаем слот: учитель снова может запустить агента.
    await agentTasks.updateOne(
      { _id: active._id, status: 'running' },
      {
        $set: {
          status: 'error',
          error: 'Задача прервана: сессия агента завершилась по таймауту, пока ждала вас. Запустите задачу заново.',
          updated_at: new Date(),
        },
        $unset: { heartbeat_at: 1 },
      },
    );
  }

  // При старте новой задачи передаём управление ИИ, чтобы не зависнуть на старой паузе
  await setControlOwner(userId, 'ai').catch(() => {});

  const now = new Date();
  const result = await agentTasks.insertOne({
    user_id: new ObjectId(userId),
    school_id: schoolId && /^[a-f\d]{24}$/i.test(schoolId) ? new ObjectId(schoolId) : null,
    title: prompt.trim().slice(0, 80),
    prompt,
    status: 'running',
    created_at: now,
    updated_at: now,
    heartbeat_at: now,
  });
  const taskId = result.insertedId.toString();

  const execute = () => runAgentTask(taskId, prompt, userId, async (event) => {
    try {
      await db.collection(COL.agentExecutions).insertOne({
        task_id: new ObjectId(taskId),
        type: event.type,
        message: event.message,
        data: event.data ?? null,
        created_at: new Date(),
      });
    } catch {
      // лог некритичен — выполнение не должно падать из-за журнала
    }
  });

  // Vercel / Next.js uses after(); in Node dev, run in background.
  try {
    after(execute);
  } catch {
    void execute().catch(() => {});
  }

  return taskId;
}

export async function listAgentTasks(userId: string, limit = 20) {
  const db = await getDb();
  const docs = await db
    .collection(COL.agentTasks)
    .find({ user_id: new ObjectId(userId) })
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray();
  return docs.map((d) => ({
    id: d._id.toString(),
    title: (d.title as string) ?? (d.prompt as string)?.slice(0, 80) ?? 'Задача',
    status: (d.status as string) ?? 'running',
    result: (d.result as string | null) ?? null,
    error: (d.error as string | null) ?? null,
    createdAt: ((d.created_at as Date) ?? new Date()).toISOString(),
  }));
}

/**
 * Учитель вернул управление ИИ, а раннер задачи тем временем умер от лимита
 * серверлесс-функции (heartbeat почти не обновляется). Если так — честно
 * перезапускаем выполнение той же задачи: пометка в журнале и новый раннер,
 * который начнёт с осмотра текущей страницы в браузере ОС.
 *
 * Живой раннер пульс бьёт недавно — он сам проснётся от смены владельца
 * управления, и двойного перезапуска не случится.
 */
export async function resurrectStalePausedTask(userId: string): Promise<{ task: string | null; action: 'resurrected' | 'alive' | 'none' }> {
  const db = await getDb();
  const tasks = db.collection(COL.agentTasks);
  const active = await tasks.findOne(
    { user_id: new ObjectId(userId), status: 'running' },
    { projection: { _id: 1, prompt: 1, heartbeat_at: 1, updated_at: 1, created_at: 1 } },
  );
  if (!active) return { task: null, action: 'none' };
  if (!runningTaskIsStale(active, Date.now())) return { task: active._id.toString(), action: 'alive' };

  const taskId = active._id.toString();
  const prompt = String(active.prompt ?? '').trim();
  // Сразу фиксируем пульс: пока новый раннер поднимается, повторные клики
  // по «Передать управление ИИ» не порождают второй подъём.
  await tasks.updateOne({ _id: active._id }, { $set: { heartbeat_at: new Date() } });

  const log = async (event: { type: string; message: string; data?: Record<string, unknown> }) => {
    try {
      await db.collection(COL.agentExecutions).insertOne({
        task_id: new ObjectId(taskId),
        type: event.type,
        message: event.message,
        data: event.data ?? null,
        created_at: new Date(),
      });
    } catch {
      // лог некритичен
    }
  };
  await log({
    type: 'RESUMED',
    message: 'Вас не было дольше, чем живёт сессия агента — задача перезапущена и продолжает работу.',
  });

  const execute = () => runAgentTask(taskId, prompt, userId, log);
  try {
    after(execute);
  } catch {
    void execute().catch(() => {});
  }
  return { task: taskId, action: 'resurrected' };
}
