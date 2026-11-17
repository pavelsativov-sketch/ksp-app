import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireApiAuth } from "@/lib/api-auth";
import { getDb, COL } from "@/lib/mongo";

export const runtime = "nodejs";

/** Остановить задачу агента:_runner видит статус на следующем шаге и завершается. */
export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const { id } = await props.params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const db = await getDb();
  const task = await db.collection(COL.agentTasks).findOne({ _id: new ObjectId(id) });
  const owner = task && ((task.user_id as ObjectId) ?? (task.userId as ObjectId));
  if (!task || !owner || owner.toString() !== auth.user.id) {
    return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
  }
  // queued тоже останавливаем: иначе диспетчер очереди позже запускал
  // задачу, которую учитель уже отменил. Условие по статусу делает смену атомарной.
  const stopped = await db.collection(COL.agentTasks).updateOne(
    { _id: new ObjectId(id), status: { $in: ["running", "queued"] } },
    { $set: { status: "stopped", result: "Остановлено пользователем", updated_at: new Date() } },
  );
  if (stopped.matchedCount === 0) {
    const current = await db.collection(COL.agentTasks).findOne({ _id: new ObjectId(id) }, { projection: { status: 1 } });
    return NextResponse.json({ ok: true, status: current?.status ?? task.status });
  }
  return NextResponse.json({ ok: true, status: "stopped" });
}
