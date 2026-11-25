import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync, clientIp } from "@/lib/rate-limit";
import { checkTerminalDailyCap, sandboxCreateGuard, SandboxCreateLimitError } from "@/lib/agents/usage-caps";
import { getWorkspaceRuntime } from "@/lib/workspace/runtime";
import { getWorkspaceTarget } from "@/lib/agents/runtime-mode";
import { randomUUID } from "node:crypto";
import { LEGACY_PID_FILE, shellQuote, terminalPidFile, terminalRunId } from "@/lib/agents/terminal-pid";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  try {
    const status = await (await getWorkspaceRuntime(auth.user.id)).getSandboxStatus();
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ available: false, error: error instanceof Error ? error.message : "Не удалось подключить Linux-среду" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const rl = await checkRateLimitAsync(`agent:terminal:${auth.user.id}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Слишком много команд терминала. Подождите минуту." }, { status: 429 });
  }
  let body: { command?: unknown; timeoutMs?: unknown; runId?: unknown };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 }); }
  if (typeof body.command !== "string" || !body.command.trim() || body.command.length > 8_000) {
    return NextResponse.json({ error: "Введите команду до 8 000 символов" }, { status: 400 });
  }
  const daily = await checkTerminalDailyCap(auth.user.id);
  if (daily) return daily;
  try {
    const runtime = await getWorkspaceRuntime(auth.user.id, { beforeCreate: sandboxCreateGuard(clientIp(req)) });
    // PID пишется в файл своего запуска (runId от клиента или наш), и заменяем
    // оболочку командой (exec): «Стоп» с этим runId убивает именно эту команду,
    // а не последнюю из параллельных. Общий файл — для старого клиента без runId.
    const runId = terminalRunId(body.runId) ?? randomUUID();
    const tracked = `echo $$ > ${terminalPidFile(runId)}; echo $$ > ${LEGACY_PID_FILE}; exec bash -lc ${shellQuote(body.command)}`;
    const result = await runtime.runCommand(tracked, typeof body.timeoutMs === "number" ? body.timeoutMs : undefined);
    return NextResponse.json({ success: result.exitCode === 0, runId, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось выполнить команду";
    if (error instanceof SandboxCreateLimitError) return NextResponse.json({ success: false, error: message }, { status: error.status });
    const sandboxConfigured = getWorkspaceTarget() !== "none";
    return NextResponse.json({ success: false, error: message }, { status: sandboxConfigured ? 500 : 503 });
  }
}
