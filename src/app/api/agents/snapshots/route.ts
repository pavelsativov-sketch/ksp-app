import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getWorkspaceRuntime } from "@/lib/workspace/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  try {
    const snapshots = await (await getWorkspaceRuntime(auth.user.id)).listSnapshots();
    return NextResponse.json({ snapshots }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось прочитать снимки" }, { status: 503 });
  }
}

export async function POST() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  try {
    const snapshot = await (await getWorkspaceRuntime(auth.user.id)).createSnapshot();
    return NextResponse.json({ ok: true, ...snapshot }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось сохранить снимок" }, { status: 503 });
  }
}

export async function PUT(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  let body: { id?: unknown };
  try { body = await req.json() as typeof body; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (typeof body.id !== "string" || body.id.length > 100) return NextResponse.json({ error: "Некорректный снимок" }, { status: 400 });
  try {
    await (await getWorkspaceRuntime(auth.user.id)).restoreSnapshot(body.id);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось восстановить снимок" }, { status: 503 });
  }
}
