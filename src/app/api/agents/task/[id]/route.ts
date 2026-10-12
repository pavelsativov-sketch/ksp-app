import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireApiAuth } from "@/lib/api-auth";
import { getDb, COL } from "@/lib/mongo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface AgentTaskDoc {
  _id: ObjectId;
  userId?: ObjectId;
  user_id?: ObjectId;
  status: string;
  created_at?: Date;
  createdAt?: Date;
  plan?: string[];
  title?: string;
}

interface AgentExecutionDoc {
  _id?: ObjectId;
  taskId?: ObjectId;
  task_id?: ObjectId;
  timestamp?: Date;
  created_at?: Date;
  type?: string;
  message?: string;
  [key: string]: unknown;
}

/** Чужие логи читать нельзя: задача должна принадлежать пользователю из сессии. */
function ownedBy(doc: AgentTaskDoc, userId: string): boolean {
  const owner = doc.userId ?? doc.user_id;
  if (!owner) return false;
  return owner.toString() === userId;
}

const POLL_MS = 700;

/** GET — SSE-поток событий задачи в реальном времени. */
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const { id: taskId } = await props.params;
  if (!ObjectId.isValid(taskId)) {
    return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
  }
  const taskObjectId = new ObjectId(taskId);

  const stream = new ReadableStream({
    async start(controller) {
      const db = await getDb();
      const agentExecutions = db.collection<AgentExecutionDoc>(COL.agentExecutions);
      const agentTasks = db.collection<AgentTaskDoc>(COL.agentTasks);

      let lastCreatedAt = new Date(0);
      const seen = new Set<string>();
      let closed = false;
      let metaSent = false;

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(interval);
        try { controller.close(); } catch { /* уже закрыт */ }
      };

      const push = (payload: unknown) => {
        try { controller.enqueue(`data: ${JSON.stringify(payload)}\n\n`); } catch { closed = true; }
      };

      const interval = setInterval(async () => {
        if (closed) return;
        try {
          const task = await agentTasks.findOne({ _id: taskObjectId });
          if (!task || !ownedBy(task, auth.user.id)) {
            push({ type: "ERROR", message: "Задача не найдена" });
            close();
            return;
          }

          // META — один раз при подключении: план и время старта для чата.
          if (!metaSent) {
            metaSent = true;
            push({
              type: "META",
              title: task.title ?? null,
              plan: task.plan ?? null,
              startedAt: task.created_at ?? task.createdAt ?? null,
            });
          }

          // Пишем task_id + created_at (см. runner). Фолбэк на старые поля — для ранних логов.
          const newLogs = await agentExecutions
            .find({
              $and: [
                { $or: [{ task_id: taskObjectId }, { taskId: taskObjectId }] },
                { $or: [{ created_at: { $gt: lastCreatedAt } }, { timestamp: { $gt: lastCreatedAt } }] },
              ],
            })
            .sort({ created_at: 1, _id: 1 })
            .limit(100)
            .toArray();

          for (const log of newLogs) {
            const id = String(log._id ?? "");
            if (id && seen.has(id)) continue;
            if (id) seen.add(id);
            const at = log.created_at ?? log.timestamp;
            if (at && at.getTime() > lastCreatedAt.getTime()) lastCreatedAt = at;
            push({
              type: log.type ?? "LOG",
              message: log.message ?? "",
              data: log.data ?? null,
              createdAt: at ? at.toISOString() : null,
            });
          }

          if (task.status !== "running") {
            push({ type: "STATUS_UPDATE", status: task.status, result: (task as { result?: string }).result ?? null, error: (task as { error?: string }).error ?? null });
            close();
            return;
          }

          // Если задача зависла в статусе «running» дольше допустимого,
          // функция Vercel/Cloudflare уже убита без обновления статуса.
          // Исправляем статус в БД, чтобы пользователь не видел вечный спиннер.
          const MAX_TASK_AGE_MS = 12 * 60_000; // 12 мин — выше потолка Vercel Pro (10 мин) + запас
          const taskStarted = (task.created_at ?? task.createdAt)?.getTime() ?? 0;
          if (taskStarted > 0 && Date.now() - taskStarted > MAX_TASK_AGE_MS) {
            const staleMsg = "Задача превысила лимит времени и была остановлена автоматически.";
            try {
              await agentTasks.updateOne(
                { _id: taskObjectId, status: "running" },
                { $set: { status: "failed", error: staleMsg, updated_at: new Date() } },
              );
            } catch { /* некритично — статус дойдёт по следующему тику */ }
            push({ type: "ERROR", message: staleMsg });
            push({ type: "STATUS_UPDATE", status: "failed", error: staleMsg });
            close();
          }
        } catch {
          // кратковременный сбой БД: не роняем поток — попробуем на следующем тике
        }
      }, POLL_MS);

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
