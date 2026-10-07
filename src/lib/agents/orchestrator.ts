import { ObjectId } from 'mongodb';
import { after } from 'next/server';
import { getDb, COL } from '@/lib/mongo';
import { runAgentTask } from './runner';

/**
 * Создаёт задачу агента и запускает реальное выполнение в фоне.
 * schoolId необязателен: агент работает и без школы (личная рабочая область).
 */
export async function startAgentTask(userId: string, schoolId: string | null, prompt: string): Promise<string> {
  const db = await getDb();
  const agentTasks = db.collection(COL.agentTasks);

  const active = await agentTasks.findOne(
    { user_id: new ObjectId(userId), status: 'running' },
    { projection: { _id: 1 } },
  );
  if (active) throw new Error('AGENT_TASK_ALREADY_RUNNING');

  const now = new Date();
  const result = await agentTasks.insertOne({
    user_id: new ObjectId(userId),
    school_id: schoolId && /^[a-f\d]{24}$/i.test(schoolId) ? new ObjectId(schoolId) : null,
    title: prompt.trim().slice(0, 80),
    prompt,
    status: 'running',
    created_at: now,
    updated_at: now,
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

  // Vercel uses after(); Cloudflare Free uses Workflows so a task can outlive
  // the 30-second waitUntil window while keeping a durable task ID for SSE.
  if (process.env.VERCEL === '1') {
    after(execute);
  } else {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    let context: Awaited<ReturnType<typeof getCloudflareContext>>;
    try { context = await getCloudflareContext({ async: true }); }
    catch {
      // Local Node dev process stays alive for the lifetime of the task.
      void execute().catch(() => {});
      return taskId;
    }
    const workflow = (context.env as typeof context.env & {
      AGENT_TASK_WORKFLOW?: { create(options: { id: string; params: { taskId: string; userId: string; prompt: string } }): Promise<unknown> };
    }).AGENT_TASK_WORKFLOW;
    if (workflow) {
      try { await workflow.create({ id: taskId, params: { taskId, userId, prompt } }); }
      catch (error) {
        const message = error instanceof Error ? error.message : "неизвестная ошибка";
        await agentTasks.updateOne({ _id: result.insertedId }, { $set: { status: "failed", error: `Не удалось запустить Cloudflare Workflow: ${message}`.slice(0, 500), updatedAt: new Date() } });
        throw new Error("Не удалось запустить рабочий процесс задания");
      }
    } else {
      (context.ctx as { waitUntil(promise: Promise<unknown>): void }).waitUntil(execute().catch(() => {}));
    }
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
