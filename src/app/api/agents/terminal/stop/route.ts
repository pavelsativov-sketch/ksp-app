import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getWorkspaceRuntime } from "@/lib/workspace/runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/** POST /api/agents/terminal/stop — послать SIGTERM последней команде терминала. */
export async function POST() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  try {
    const runtime = await getWorkspaceRuntime(auth.user.id);
    await runtime.runCommand(
      "kill -TERM $(cat /tmp/mekty-term.pid 2>/dev/null) 2>/dev/null || true",
      5000,
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Не удалось остановить команду" }, { status: 503 });
  }
}
