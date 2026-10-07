import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireApiAuth } from "@/lib/api-auth";
import { getDb, COL } from "@/lib/mongo";
import { getWorkspaceRuntime } from "@/lib/workspace/runtime";

export const dynamic = "force-dynamic";

async function verifyOptionalTask(taskId: string | null, userId: string): Promise<boolean> {
  if (!taskId) return true;
  if (!/^[a-f\d]{24}$/i.test(taskId)) return false;
  const task = await (await getDb()).collection(COL.agentTasks).findOne({ _id: new ObjectId(taskId) });
  const owner = task && ((task.user_id as ObjectId) ?? (task.userId as ObjectId));
  return !!owner && owner.toString() === userId;
}

/** Files for the authenticated account's persistent workspace. */
export async function GET(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const url = new URL(req.url);
  if (!await verifyOptionalTask(url.searchParams.get("taskId"), auth.user.id)) {
    return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
  }

  try {
    const runtime = await getWorkspaceRuntime(auth.user.id);
    const file = url.searchParams.get("file");
    if (file !== null) {
      const content = await runtime.readFile(file);
      if (url.searchParams.get("download") === "1") {
        const filename = file.split("/").pop() ?? "workspace-file";
        return new NextResponse(content, {
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
            "Cache-Control": "no-store",
          },
        });
      }
      return NextResponse.json(
        { name: file, content: content.slice(0, 20_000), truncated: content.length > 20_000 },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const files = (await runtime.listFiles()).map((entry) => ({
      ...entry,
      sizeLabel: entry.size < 1024 ? `${entry.size} Б`
        : entry.size < 1024 * 1024 ? `${(entry.size / 1024).toFixed(1)} КБ`
        : `${(entry.size / 1024 / 1024).toFixed(1)} МБ`,
    }));
    return NextResponse.json({ files }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось открыть рабочую среду" }, { status: 503 });
  }
}

export async function PUT(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  let body: { file?: string; content?: string };
  try { body = await req.json() as typeof body; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (typeof body.file !== "string" || typeof body.content !== "string" || body.content.length > 200_000) {
    return NextResponse.json({ error: "Некорректный файл или содержимое" }, { status: 400 });
  }

  try {
    await (await getWorkspaceRuntime(auth.user.id)).writeFile(body.file, body.content);
    return NextResponse.json({ ok: true, name: body.file }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось сохранить файл" }, { status: 503 });
  }
}

export async function DELETE(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const file = new URL(req.url).searchParams.get("file");
  if (!file) return NextResponse.json({ error: "Нет имени файла" }, { status: 400 });

  try {
    await (await getWorkspaceRuntime(auth.user.id)).deleteFile(file);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось удалить файл" }, { status: 503 });
  }
}
