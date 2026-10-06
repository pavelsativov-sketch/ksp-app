import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { ObjectId } from 'mongodb';
import { requireApiAuth } from '@/lib/api-auth';
import { getDb, COL } from '@/lib/mongo';
import { machineDir } from '@/lib/agents/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Песочница задачи: список файлов и просмотр содержимого. Чужая задача — 404. */
export async function GET(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const url = new URL(req.url);
  const taskId = url.searchParams.get('taskId') ?? '';
  const file = url.searchParams.get('file');
  if (!/^[a-f\d]{24}$/i.test(taskId)) {
    return NextResponse.json({ error: 'Invalid taskId' }, { status: 400 });
  }
  // Задача должна принадлежать пользователю — иначе можно читать чужую песочницу.
  const task = await (await getDb()).collection(COL.agentTasks).findOne({ _id: new ObjectId(taskId) });
  const owner = task && ((task.user_id as ObjectId) ?? (task.userId as ObjectId));
  if (!task || !owner || owner.toString() !== auth.user.id) {
    return NextResponse.json({ error: 'Задача не найдена' }, { status: 404 });
  }

  const dir = await machineDir(auth.user.id);

  try {
    if (file !== null) {
      // Просмотр/скачивание одного файла: только имя внутри песочницы.
      const safe = path.join(dir, path.basename(file));
      const content = await fs.readFile(safe, 'utf8');
      return NextResponse.json(
        { name: path.basename(file), content: content.slice(0, 20_000), truncated: content.length > 20_000 },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((e) => e.isFile())
        .map(async (e) => {
          const st = await fs.stat(path.join(dir, e.name));
          return {
            name: e.name,
            size: st.size,
            sizeLabel: st.size < 1024 ? `${st.size} Б`
              : st.size < 1024 * 1024 ? `${(st.size / 1024).toFixed(1)} КБ`
              : `${(st.size / 1024 / 1024).toFixed(1)} МБ`,
            modified: st.mtime.toISOString(),
          };
        }),
    );
    files.sort((a, b) => b.modified.localeCompare(a.modified));
    return NextResponse.json({ files }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ files: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
}

/** Создать/перезаписать файл в машине пользователя (реальная запись на диск). */
export async function PUT(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  let body: { file?: string; content?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof body.file !== 'string' || typeof body.content !== 'string' || body.content.length > 200_000) {
    return NextResponse.json({ error: 'Некорректный файл или содержимое' }, { status: 400 });
  }
  const dir = await machineDir(auth.user.id);
  const safe = path.join(dir, path.basename(body.file));
  await fs.writeFile(safe, body.content, 'utf8');
  return NextResponse.json({ ok: true, name: path.basename(body.file) });
}

/** Удалить файл из машины пользователя. */
export async function DELETE(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const url = new URL(req.url);
  const file = url.searchParams.get('file');
  if (!file) return NextResponse.json({ error: 'Нет имени файла' }, { status: 400 });
  const dir = await machineDir(auth.user.id);
  await fs.rm(path.join(dir, path.basename(file)), { force: true });
  return NextResponse.json({ ok: true });
}
