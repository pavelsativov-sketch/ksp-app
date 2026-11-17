import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireApiAuth } from "@/lib/api-auth";
import { getDb, COL } from "@/lib/mongo";
import { runningTaskIsStale } from "@/lib/agents/lease";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface AgentTaskDoc {
  _id: ObjectId;
  userId?: ObjectId;
  user_id?: ObjectId;
  status: string;
  created_at?: Date;
  createdAt?: Date;
  heartbeat_at?: Date;
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
/** Комментарий-пинг раз в ~14 с: прокси не рвут «тихий» поток (пауза, очередь). */
const KEEPALIVE_TICKS = 20;
/** Потолок жизни одного потока; EventSource переподключится с Last-Event-ID. */
const MAX_STREAM_MS = 30 * 60_000;

/** GET — SSE-поток событий задачи в реальном времени. */
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const { id: taskId } = await props.params;
  if (!ObjectId.isValid(taskId)) {
    return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
  }
  const taskObjectId = new ObjectId(taskId);
  // Переподключение EventSource: продолжаем с метки последнего отданного лога.
  const resumeFrom = Number(req.headers.get("last-event-id"));

  // Клиент ушёл (cancel/abort) — опрос базы должен остановиться сразу.
  let cancelled = false;
  let stopPolling: () => void = () => { cancelled = true; };
  const stream = new ReadableStream({
    async start(controller) {
      const db = await getDb();
      const agentExecutions = db.collection<AgentExecutionDoc>(COL.agentExecutions);
      const agentTasks = db.collection<AgentTaskDoc>(COL.agentTasks);
      if (cancelled || req.signal.aborted) {
        try { controller.close(); } catch { /* уже отменён */ }
        return;
      }

      let lastCreatedAt = new Date(Number.isFinite(resumeFrom) && resumeFrom > 0 ? resumeFrom : 0);
      // Только id логов с меткой lastCreatedAt: запрос идёт по $gte, логи той же
      // миллисекунды не теряются, а набор сбрасывается при сдвиге метки.
      const seen = new Set<string>();
      let closed = false;
      let metaSent = false;
      let queuedSent = false;
      let ticks = 0;
      const openedAt = Date.now();

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(interval);
        try { controller.close(); } catch { /* уже закрыт */ }
      };

      const push = (payload: unknown) => {
        try { controller.enqueue(`data: ${JSON.stringify(payload)}\n\n`); } catch { close(); }
      };

      const interval = setInterval(async () => {
        if (closed) return;
        if (Date.now() - openedAt > MAX_STREAM_MS) {
          close();
          return;
        }
        if (++ticks % KEEPALIVE_TICKS === 0) {
          try { controller.enqueue(": keepalive\n\n"); } catch { close(); return; }
        }
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

          // Задача в очереди — сообщаем об этом один раз, поток держим открытым.
          if (!queuedSent && task.status === "queued") {
            queuedSent = true;
            push({ type: "STATUS_UPDATE", status: "queued" });
          }

          // Пишем task_id + created_at (см. runner). Фолбэк на старые поля — для ранних логов.
          const newLogs = await agentExecutions
            .find({
              $and: [
                { $or: [{ task_id: taskObjectId }, { taskId: taskObjectId }] },
                { $or: [{ created_at: { $gte: lastCreatedAt } }, { timestamp: { $gte: lastCreatedAt } }] },
              ],
            })
            .sort({ created_at: 1, _id: 1 })
            .limit(100)
            .toArray();

          for (const log of newLogs) {
            const id = String(log._id ?? "");
            if (id && seen.has(id)) continue;
            const at = log.created_at ?? log.timestamp;
            if (at && at.getTime() > lastCreatedAt.getTime()) {
              lastCreatedAt = at;
              seen.clear();
            }
            if (id) seen.add(id);
            try { controller.enqueue(`id: ${lastCreatedAt.getTime()}\n`); } catch { close(); return; }
            push({
              type: log.type ?? "LOG",
              message: log.message ?? "",
              data: log.data ?? null,
              createdAt: at ? at.toISOString() : null,
            });
          }

          // Очередь и выполнение — «живые» статусы; остальное терминально.
          const terminal = task.status !== "running" && task.status !== "queued";
          if (terminal) {
            push({ type: "STATUS_UPDATE", status: task.status, result: (task as { result?: string }).result ?? null, error: (task as { error?: string }).error ?? null });
            close();
            return;
          }

          // Если задача зависла в статусе «running» дольше допустимого,
          // функция Vercel/Cloudflare уже убита без обновления статуса.
          // Исправляем статус в БД, чтобы пользователь не видел вечный спиннер.
          //
          // Единый порог и порядок heartbeat → updated_at → created_at
          // определены в lease.ts и используются также очередью.
          if (task.status === "running" && runningTaskIsStale(task, Date.now())) {
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

      stopPolling = close;
      req.signal.addEventListener("abort", close);
    },
    cancel() {
      stopPolling();
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
