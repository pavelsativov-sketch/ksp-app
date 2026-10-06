import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getDb, COL } from "@/lib/mongo";
import { isMongoConfigured } from "@/lib/mongo";

export const dynamic = "force-dynamic";

interface WorkspaceFileDoc {
  _id: unknown;
  user_id: string;
  path: string;
  name: string;
  content?: string;
  created_at: Date;
  updated_at: Date;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * Раньше обработчик был открытым: любой посетитель мог читать и перезаписывать
 * чужие файлы, указав произвольный workspaceId, а путь не проверялся вовсе
 * (`../../`), поэтому в коллекцию можно было положить запись вне рабочей
 * области учителя. Плюс запрос шёл по полю `workspaceId`, которого в индексах
 * (`workspace_files_user_path`) нет — коллекция сканировалась целиком.
 *
 * Теперь доступ привязан к владельцу сессии, путь нормализуется, размер
 * содержимого ограничен, а запись всегда принадлежит текущему пользователю.
 */
function normalizePath(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!trimmed || trimmed.length > 400) return null;
  const segments = trimmed.split("/").filter((s) => s.length > 0 && s !== ".");
  if (segments.some((s) => s === "..")) return null;
  if (!segments.length) return null;
  return segments.join("/");
}

function normalizeName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.trim();
  if (!name || name.length > 200) return null;
  if (/[\\/:*?"<>|]/.test(name)) return null;
  return name;
}

export async function GET(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  if (!isMongoConfigured()) return badRequest("MongoDB не настроена");

  const { searchParams } = new URL(req.url);
  const path = normalizePath(searchParams.get("path"));

  const collection = (await getDb()).collection<WorkspaceFileDoc>(COL.workspaceFiles);
  const filter = path
    ? { user_id: auth.user.id, path }
    : { user_id: auth.user.id };

  const files = await collection
    .find(filter, { projection: { content: 0 } })
    .sort({ updated_at: -1 })
    .limit(500)
    .toArray();

  return NextResponse.json({ files }, { status: 200 });
}

export async function POST(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  if (!isMongoConfigured()) return badRequest("MongoDB не настроена");

  let body: { path?: unknown; name?: unknown; content?: unknown };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  const path = normalizePath(body.path);
  if (!path) return badRequest("Некорректный путь");
  const name = normalizeName(body.name ?? path.split("/").pop());
  if (!name) return badRequest("Некорректное имя файла");

  const content = typeof body.content === "string" ? body.content : "";
  // 512 КБ — разумный предел для текстового файла рабочей области.
  if (Buffer.byteLength(content, "utf8") > 512 * 1024) {
    return badRequest("Файл больше 512 КБ");
  }

  const now = new Date();
  const collection = (await getDb()).collection<WorkspaceFileDoc>(COL.workspaceFiles);
  await collection.updateOne(
    { user_id: auth.user.id, path, name },
    {
      $set: { content, updated_at: now },
      $setOnInsert: { user_id: auth.user.id, path, name, created_at: now },
    },
    { upsert: true },
  );

  return NextResponse.json({ success: true }, { status: 201 });
}

export async function DELETE(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  if (!isMongoConfigured()) return badRequest("MongoDB не настроена");

  const { searchParams } = new URL(req.url);
  const path = normalizePath(searchParams.get("path"));
  const name = normalizeName(searchParams.get("name"));
  if (!path || !name) return badRequest("Нужны path и name");

  const collection = (await getDb()).collection<WorkspaceFileDoc>(COL.workspaceFiles);
  const result = await collection.deleteOne({ user_id: auth.user.id, path, name });

  return NextResponse.json({ success: result.deletedCount === 1 }, { status: 200 });
}