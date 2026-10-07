import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb, COL } from "@/lib/mongo";
import { validateRunnerWorkspace, verifyRunnerClaim } from "@/lib/workspace/gitlab-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate" };

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 2_500_000) return NextResponse.json({ error: "Payload слишком большой" }, { status: 413, headers: NO_STORE });

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Некорректный JSON" }, { status: 400, headers: NO_STORE }); }

  const executionId = body.executionId;
  const userId = body.userId;
  const expiresAt = body.expiresAt;
  const signature = request.headers.get("X-Mekty-Runner-Signature") ?? "";
  if (typeof executionId !== "string" || typeof userId !== "string" || typeof expiresAt !== "number"
    || !await verifyRunnerClaim(executionId, userId, expiresAt, signature)) {
    return NextResponse.json({ error: "Недействительная авторизация runner" }, { status: 401, headers: NO_STORE });
  }

  const db = await getDb();
  const collection = db.collection(COL.agentRunnerExecutions);
  const execution = await collection.findOne({ execution_id: executionId, user_id: new ObjectId(userId) });
  if (!execution || !(execution.expires_at instanceof Date) || execution.expires_at.getTime() !== expiresAt) {
    return NextResponse.json({ error: "Задание runner не найдено или срок истёк" }, { status: 404, headers: NO_STORE });
  }

  if (body.action === "start") {
    const claimed = await collection.updateOne(
      { execution_id: executionId, user_id: new ObjectId(userId), status: "queued", expires_at: { $gt: new Date() } },
      { $set: { status: "running", started_at: new Date() } },
    );
    if (claimed.modifiedCount !== 1) {
      return NextResponse.json({ error: "Задание уже запущено или отменено" }, { status: 409, headers: NO_STORE });
    }
    const files = await db.collection(COL.workspaceFiles)
      .find({ user_id: new ObjectId(userId), path: { $regex: "^workspace(?:/|$)" } }, { projection: { _id: 0, path: 1, name: 1, content: 1, updated_at: 1 } })
      .limit(500).toArray();
    if (!validateRunnerWorkspace(files)) {
      await collection.updateOne({ execution_id: executionId }, { $set: { status: "failed", error: "Рабочая область содержит неподдерживаемый путь или превышает лимит 2 МБ" } });
      return NextResponse.json({ error: "Рабочая область слишком велика или содержит неподдерживаемые пути" }, { status: 413, headers: NO_STORE });
    }
    const sourceVersions = Object.fromEntries(files
      .filter((file) => file.updated_at instanceof Date)
      .map((file) => [`${file.path}\n${file.name}`, file.updated_at.getTime()]));
    await collection.updateOne({ execution_id: executionId }, { $set: { source_versions: sourceVersions } });
    return NextResponse.json({ command: execution.command, timeoutMs: execution.timeout_ms, files }, { headers: NO_STORE });
  }

  if (body.action === "finish") {
    if ((execution.status !== "running" && execution.status !== "queued") || !validateRunnerWorkspace(body.files)
      || typeof body.exitCode !== "number" || !Number.isInteger(body.exitCode)
      || typeof body.stdout !== "string" || typeof body.stderr !== "string") {
      return NextResponse.json({ error: "Результат runner некорректен" }, { status: 400, headers: NO_STORE });
    }
    const result = {
      exitCode: Math.max(-1, Math.min(255, body.exitCode)),
      stdout: body.stdout.slice(0, 18_000),
      stderr: body.stderr.slice(0, 8_000),
      cwd: "/workspace",
      files: body.files,
    };
    const saved = await collection.updateOne(
      { execution_id: executionId, user_id: new ObjectId(userId), status: { $in: ["running", "queued"] }, expires_at: { $gt: new Date() } },
      { $set: { status: "completed", result, completed_at: new Date() } },
    );
    if (saved.modifiedCount !== 1) return NextResponse.json({ error: "Задание уже завершено или просрочено" }, { status: 409, headers: NO_STORE });
    return NextResponse.json({ saved: true }, { headers: NO_STORE });
  }

  return NextResponse.json({ error: "Неизвестное действие runner" }, { status: 400, headers: NO_STORE });
}
