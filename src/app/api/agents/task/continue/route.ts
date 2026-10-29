import { NextResponse } from "next/server";
import { verifyContinuation } from "@/lib/agents/continuation";
import { continueAgentTask } from "@/lib/agents/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Продолжение исполняется в after() этого запроса: ему нужна полная длина сессии.
export const maxDuration = 300;

/**
 * Служебный вызов: раннер, у которого кончилось время сессии, просит
 * продолжить свою же задачу в новом запросе. Доступ только по HMAC-подписи
 * от AUTH_SECRET — это не пользовательский маршрут.
 */
export async function POST(req: Request) {
  let taskId = "";
  try {
    const body = (await req.json()) as { taskId?: unknown };
    taskId = typeof body.taskId === "string" ? body.taskId : "";
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  if (!/^[a-f\d]{24}$/i.test(taskId)) return NextResponse.json({ error: "Некорректная задача" }, { status: 400 });
  if (!verifyContinuation(taskId, req.headers.get("x-mekty-continue"))) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const result = await continueAgentTask(taskId);
  return NextResponse.json({ ok: result === "started", result }, { status: result === "started" ? 202 : 200 });
}
