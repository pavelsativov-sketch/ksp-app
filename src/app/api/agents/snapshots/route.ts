import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireApiAuth } from "@/lib/api-auth";
import { machineDir } from "@/lib/agents/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SNAPSHOT_ROOT = path.join(process.cwd(), "workspace-data", "snapshots");

function snapshotRoot(userId: string): string {
  return path.join(SNAPSHOT_ROOT, /^[a-f\d]{24}$/i.test(userId) ? `u_${userId}` : "u_misc");
}

/** Список снапшотов машины (для восстановления). */
export async function GET() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  try {
    const entries = await fs.readdir(snapshotRoot(auth.user.id), { withFileTypes: true });
    const list = entries.filter((e) => e.isDirectory()).map((e) => ({ id: e.name })).sort((a, b) => b.id.localeCompare(a.id)).slice(0, 20);
    return NextResponse.json({ snapshots: list }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ snapshots: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}

/** Создать снапшот: полная копия машины в snapshots/<timestamp>. */
export async function POST(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const machine = await machineDir(auth.user.id);
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  await fs.mkdir(snapshotRoot(auth.user.id), { recursive: true });
  await fs.cp(machine, path.join(snapshotRoot(auth.user.id), id), { recursive: true });
  return NextResponse.json({ ok: true, id }, { headers: { "Cache-Control": "no-store" } });
}

/** Восстановить снапшот: текущая машина заменяется копией (в себя — бэкап). */
export async function PUT(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  let body: { id?: string };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const id = typeof body.id === "string" ? body.id.replace(/[^0-9T-]/g, "") : "";
  if (!id) return NextResponse.json({ error: "Нет id снапшота" }, { status: 400 });

  const snapDir = path.join(snapshotRoot(auth.user.id), id);
  const machine = await machineDir(auth.user.id);
  try {
    // Прежнее состояние сохраняем как rollback-снапшот.
    const rollback = path.join(snapshotRoot(auth.user.id), `rollback-${new Date().toISOString().replace(/[:.]/g, "-")}`);
    await fs.cp(machine, rollback, { recursive: true });
    await fs.rm(machine, { recursive: true, force: true });
    await fs.cp(snapDir, machine, { recursive: true });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "restore failed" }, { status: 500 });
  }
}
