import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getWorkspaceRuntime } from "@/lib/workspace/runtime";
import { terminalRunId, terminalStopCommand } from "@/lib/agents/terminal-pid";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * POST /api/agents/terminal/stop — послать SIGTERM команде терминала.
 * С { runId } — именно этому запуску; без тела — последней команде (старый клиент).
 */
export async function POST(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  let runId: string | null = null;
  try {
    runId = terminalRunId(((await req.json()) as { runId?: unknown }).runId);
  } catch {
    // пустое тело — старый клиент без runId
  }
  try {
    const runtime = await getWorkspaceRuntime(auth.user.id);
    await runtime.runCommand(terminalStopCommand(runId), 5000);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Не удалось остановить команду" }, { status: 503 });
  }
}
