import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getShellSession, sinceSeq, shellExec, shellInterrupt, restartShell } from "@/lib/agents/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Настоящая оболочка пользователя: GET — SSE-поток вывода (реальное время),
 * POST — ввод команды / Ctrl+C / перезапуск.
 */
export async function GET(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const userId = auth.user.id;

  const url = new URL(req.url);
  let since = Number(url.searchParams.get("since") ?? 0) || 0;

  const stream = new ReadableStream({
    async start(controller) {
      const s = await getShellSession(userId);
      let closed = false;
      const send = (payload: unknown) => {
        if (closed) return;
        try { controller.enqueue(`data: ${JSON.stringify(payload)}\n\n`); } catch { closed = true; }
      };

      send({ since, snapshot: sinceSeq(s, since), lastSeq: s.lastSeq });
      since = s.lastSeq;

      const interval = setInterval(() => {
        const text = sinceSeq(s, since);
        if (text) {
          send({ since, text });
          since = s.lastSeq;
        }
      }, 500);
      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        try { controller.close(); } catch { /* уже закрыт */ }
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

export async function POST(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const userId = auth.user.id;

  let body: { cmd?: string; ctrlc?: boolean; restart?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.restart) {
    await restartShell(userId);
    return NextResponse.json({ ok: true, action: "restart" });
  }
  if (body.ctrlc) {
    shellInterrupt(userId);
    return NextResponse.json({ ok: true, action: "ctrlc" });
  }
  const cmd = typeof body.cmd === "string" ? body.cmd.slice(0, 4000) : "";
  if (!cmd) return NextResponse.json({ error: "Пустая команда" }, { status: 400 });

  const result = await shellExec(userId, cmd, 60_000);
  return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
}
