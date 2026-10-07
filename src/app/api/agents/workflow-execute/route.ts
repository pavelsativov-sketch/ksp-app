import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb, COL } from "@/lib/mongo";
import { runAgentTask, type ExecutionEvent } from "@/lib/agents/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sign(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function POST(request: Request) {
  const secret = process.env.AUTH_SECRET;
  const timestamp = request.headers.get("X-Mekty-Workflow-Timestamp") ?? "";
  const signature = request.headers.get("X-Mekty-Workflow-Signature") ?? "";
  const timestampMs = Number(timestamp);
  if (!secret || !Number.isSafeInteger(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60_000) {
    return NextResponse.json({ error: "Недействительная внутренняя авторизация" }, { status: 401 });
  }

  let body: { taskId?: unknown; userId?: unknown; prompt?: unknown };
  try { body = await request.json() as typeof body; }
  catch { return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 }); }

  if (typeof body.taskId !== "string" || !/^[a-f\d]{24}$/i.test(body.taskId)
    || typeof body.userId !== "string" || !/^[a-f\d]{24}$/i.test(body.userId)
    || typeof body.prompt !== "string" || body.prompt.length < 3 || body.prompt.length > 4000) {
    return NextResponse.json({ error: "Некорректная задача" }, { status: 400 });
  }

  const expected = await sign(`${timestamp}\n${body.taskId}\n${body.userId}\n${body.prompt}`, secret);
  if (!constantTimeEqual(signature, expected)) {
    return NextResponse.json({ error: "Недействительная внутренняя авторизация" }, { status: 401 });
  }

  const taskId = new ObjectId(body.taskId);
  const userId = new ObjectId(body.userId);
  const db = await getDb();
  const task = await db.collection(COL.agentTasks).findOne({ _id: taskId, user_id: userId }, { projection: { status: 1 } });
  if (!task || task.status !== "running") return NextResponse.json({ skipped: true });

  const log = async (event: ExecutionEvent) => {
    try {
      await db.collection(COL.agentExecutions).insertOne({
        task_id: taskId,
        type: event.type,
        message: event.message,
        data: event.data ?? null,
        created_at: new Date(),
      });
    } catch {
      // Потеря записи журнала не останавливает задачу.
    }
  };

  await runAgentTask(body.taskId, body.prompt, body.userId, log);
  return NextResponse.json({ completed: true });
}
