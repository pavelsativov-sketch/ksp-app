import { ObjectId, type Collection } from 'mongodb';
import { after } from 'next/server';
import { getDb, COL } from '@/lib/mongo';
import { runAgentTask } from './runner';
import { setControlOwner } from './session';
import { runningTaskIsStale } from './lease';

/**
 * Создаёт задачу агента и запускает реальное выполнение в фоне.
 * schoolId необязателен: агент работает и без школы (личная рабочая область).
 */

/**
 * Запускает следующую задачу из очереди (status: 'queued'), если слот
 * пользователя свободен. Вызывается после завершения любой задачи.
 */
/**
 * Единый атомарный захват queued-задачи и её выполнение.
 *
 * findOneAndUpdate со статусом queued→running гарантирует: из нескольких
 * конкурирующих вызовов (поллер, триггер из GET, finish) только один получит
 * документ и исполнит задачу; остальные получат null и ничего не делают.
 */
export type QueuedTask = { _id?: ObjectId; prompt?: string; user_id?: ObjectId };

/**
 * Атомарно захватывает следующую queued-задачу (queued → running).
 * Вынесено отдельной функцией, чтобы очередь проверялась тестом без Next.js.
 */
export async function claimNextQueuedTask(agentTasks: Collection): Promise<QueuedTask | null> {
  // Берём не «самую старую задачу вообще», а перебираем кандидатов по
  // очереди: если у владельца первой уже бежит другая задача, уникальный
  // индекс «один running на пользователя» даёт E11000. Раньше это
  // исключение блокировало очередь ВСЕХ остальных пользователей.
  const candidates = await agentTasks
    .find({ status: 'queued' }, { projection: { _id: 1, user_id: 1 } })
    .sort({ created_at: 1 })
    .limit(25)
    .toArray();
  let task: QueuedTask | null = null;
  const blockedUsers = new Set<string>();
  const freedUsers = new Set<string>();
  const pending = [...candidates];
  while (pending.length) {
    const candidate = pending.shift()!;
    const owner = String(candidate.user_id ?? '');
    if (!owner || blockedUsers.has(owner)) continue;
    try {
      // mongodb >= 6 возвращает сам документ (без обёртки { value }).
      const claimed = await agentTasks.findOneAndUpdate(
        { _id: candidate._id, status: 'queued' },
        { $set: { status: 'running', heartbeat_at: new Date(), updated_at: new Date() } },
        { returnDocument: 'after', includeResultMetadata: false },
      );
      if (claimed?._id) {
        task = claimed as unknown as QueuedTask;
        break;
      }
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) {
        console.error('[agent] claim failed', e instanceof Error ? e.message : String(e));
        continue;
      }
      // У пользователя уже есть running. Если это зомби (раннер умер) —
      // освобождаем слот, иначе его очередь стояла бы вечно.
      blockedUsers.add(owner);
      try {
        const running = await agentTasks.findOne(
          { user_id: candidate.user_id, status: 'running' },
          { projection: { _id: 1, heartbeat_at: 1, updated_at: 1, created_at: 1 } },
        );
        if (running && runningTaskIsStale(running, Date.now())) {
          await agentTasks.updateOne(
            { _id: running._id, status: 'running' },
            { $set: { status: 'failed', error: 'Задача прервана: раннер агента перестал отвечать.', updated_at: new Date() }, $unset: { heartbeat_at: 1 } },
          );
          // Слот освобождён — сразу пробуем эту же задачу ещё раз (один раз).
          if (!freedUsers.has(owner)) {
            freedUsers.add(owner);
            blockedUsers.delete(owner);
            pending.unshift(candidate);
          }
        }
      } catch { /* проверим на следующем запуске */ }
    }
  }
  if (!task?._id || typeof task.prompt !== 'string' || !task.user_id) return null;
  return task;
}

/**
 * Единая точка запуска следующей задачи очереди.
 *
 * Атомарный findOneAndUpdate переводит queued→running (уникальный частичный
 * индекс защищает от двойного запуска). Выполнение запускается через after():
 * Next.js гарантирует выполнение после ответа даже в serverless-изоляте.
 * В dev-режиме (где after() не работает) фоллбэк — setTimeout(0).
 */
function tryStartNextFromQueue(): void {
  const work = async () => {
    let db;
    try {
      db = await getDb();
    } catch (e) {
      console.error("[agent] tryStartNextFromQueue: БД недоступна", e instanceof Error ? e.message : String(e));
      return;
    }
    const agentTasks = db.collection(COL.agentTasks);
    let task: Awaited<ReturnType<typeof claimNextQueuedTask>>;
    try {
      task = await claimNextQueuedTask(agentTasks);
    } catch (e) {
      console.error("[agent] tryStartNextFromQueue: не удалось взять задачу из очереди", e instanceof Error ? e.message : String(e));
      return;
    }
    if (!task?._id || typeof task.prompt !== 'string' || !task.user_id) return;
    const taskId = task._id.toString();
    const userId = String(task.user_id);
    try {
      await runAgentTask(taskId, task.prompt!, userId, async (event) => {
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
      });
    } catch (e) {
      console.error("[agent] tryStartNextFromQueue execute failed", e instanceof Error ? e.message : String(e));
      await db.collection(COL.agentTasks).updateOne(
        { _id: new ObjectId(taskId), status: "running" },
        { $set: { status: "failed", error: "dispatch failed", updated_at: new Date() } },
      ).catch(() => {});
    }
  };
  // after() гарантирует выполнение после ответа HTTP даже в serverless-изоляте;
  // в dev-режиме after() недоступен — фоллбэк на setTimeout(0).
  try {
    after(work);
  } catch {
    setTimeout(() => { void work(); }, 0);
  }
}

export function dispatchQueuedTask(): Promise<string | null> {
  // Сохранён API: сразу запускаем глобальный диспетчер. Задача берётся
  // атомарно и не привязана к userId, если пользователь не указан.
  tryStartNextFromQueue();
  return Promise.resolve(null);
}

export async function startAgentTask(userId: string, schoolId: string | null, prompt: string): Promise<{ id: string; status: 'running' | 'queued' }> {
  const db = await getDb();
  const agentTasks = db.collection(COL.agentTasks);

  const active = await agentTasks.findOne(
    { user_id: new ObjectId(userId), status: 'running' },
    { projection: { _id: 1, heartbeat_at: 1, updated_at: 1, created_at: 1 } },
  );
  if (active && !runningTaskIsStale(active, Date.now())) {
    // Пока бежит живая задача, новую ставим в очередь: набор поручений
    // не должен падать с 409.
    const now = new Date();
    const q = await agentTasks.insertOne({
      user_id: new ObjectId(userId),
      school_id: schoolId && /^[a-f\d]{24}$/i.test(schoolId) ? new ObjectId(schoolId) : null,
      title: prompt.trim().slice(0, 80),
      prompt,
      status: 'queued',
      created_at: now,
      updated_at: now,
    });
    return { id: q.insertedId.toString(), status: 'queued' };
  }
  if (active) {
    // Серверлесс-функция раннера погибла (лимит 300 с), а статус остался
    // running и навсегда блокировал новые задачи. Честно закрываем зомби
    // и освобождаем слот: учитель снова может запустить агента.
    await agentTasks.updateOne(
      { _id: active._id, status: 'running' },
      {
        $set: {
          status: 'failed',
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
  let taskId: string;
  try {
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
    taskId = result.insertedId.toString();
  } catch (error) {
    // Параллельный запрос успел создать running-задачу между нашим findOne и
    // insertOne — уникальный частичный индекс. Не падаем с 409, а ставим
    // новое поручение в очередь.
    if ((error as { code?: number }).code === 11000) {
      const q = await agentTasks.insertOne({
        user_id: new ObjectId(userId),
        school_id: schoolId && /^[a-f\d]{24}$/i.test(schoolId) ? new ObjectId(schoolId) : null,
        title: prompt.trim().slice(0, 80),
        prompt,
        status: 'queued',
        created_at: now,
        updated_at: now,
      });
      return { id: q.insertedId.toString(), status: 'queued' };
    }
    throw error;
  }

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

  return { id: taskId, status: 'running' };
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
 * Есть ли у учителя задача агента, которая действительно ещё едет.
 *
 * Панель владения рабочей областью спрашивает об этом, когда в базе значится
 * «владеет ИИ»: запись могла остаться от задачи, раннер которой погиб по
 * таймауту серверлес-функции. Зомби считаем мёртвой задачей — иначе чип
 * «AI работает» горел бы у учителя indefinitely.
 */
export async function hasLiveAgentTask(userId: string): Promise<boolean> {
  try {
    const db = await getDb();
    const active = await db.collection(COL.agentTasks).findOne(
      { user_id: new ObjectId(userId), status: 'running' },
      { projection: { _id: 1, heartbeat_at: 1, updated_at: 1, created_at: 1 } },
    );
    if (!active) return false;
    return !runningTaskIsStale(active, Date.now());
  } catch {
    // База недоступна — не отнимаем управление у учителя на догадке.
    return true;
  }
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

/**
 * Запуск следующей задачи из очереди в контексте активного запроса.
 *
 * В dev-окружении фоновые вызовы after/setTimeout после завершения ответа
 * могут не исполняться; поэтому здесь задача выполняется синхронно внутри
 * живого запроса (аналогично первичному старту через POST). Клиенты, которые
 * поллят GET /api/agents/task, тем самым «пробуждают» очередь и дожидаются
 * выполнения следующей задачи.
 */
export async function maybeDispatchQueuedFromRequest(): Promise<string | null> {
  // «Будильник»: планируем попытку запуска (атомарную) в фоне и сразу
  // возвращаем управление запросу — долгие задачи не блокируют GET.
  tryStartNextFromQueue();
  return null;
}

/**
 * Страховочный поллер очереди: в окружениях, где фоновый вызов диспетчера
 * из finish() может теряться (например, dev/Node без активного запроса),
 * каждые 5 секунд проверяем: есть queued-задача и нет running — берём одну.
 * Атомарный findOneAndUpdate + уникальный частичный индекс защищают от
 * двойного запуска при нескольких инстансах.
 */
// Поллер на setInterval убран: в серверлесс-функции после ответа таймеры
// замораживаются, а на каждом тёплом инстансе он лишний раз бил по Mongo.
// Очередь двигают три триггера: завершение задачи (runner.finish →
// dispatchQueuedTask), «будильник» GET /api/agents/task и новый POST.
