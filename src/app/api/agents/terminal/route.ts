import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getWorkspaceRuntime } from "@/lib/workspace/runtime";

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
  let body: { command?: unknown; timeoutMs?: unknown };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 }); }
  if (typeof body.command !== "string" || !body.command.trim() || body.command.length > 8_000) {
    return NextResponse.json({ error: "Введите команду до 8 000 символов" }, { status: 400 });
  }
  try {
    const runtime = await getWorkspaceRuntime(auth.user.id);
    // Записываем PID процесса в /tmp/mekty-term.pid и заменяем оболочку
    // командой (exec): теперь «Стоп» (/api/agents/terminal/stop) может
    // послать SIGTERM именно процессу команды, а не обёртке.
    const tracked = `echo $$ > /tmp/mekty-term.pid; exec ${body.command}`;
    const result = await runtime.runCommand(tracked, typeof body.timeoutMs === "number" ? body.timeoutMs : undefined);
    return NextResponse.json({ success: result.exitCode === 0, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось выполнить команду";
    const sandboxConfigured = process.env.VERCEL === "1" || process.env.WORKSPACE_RUNTIME === "vercel-sandbox";
    return NextResponse.json({ success: false, error: message }, { status: sandboxConfigured ? 500 : 503 });
  }
}
