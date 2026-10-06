import { NextResponse } from "next/server";
import { getPublicAssignment } from "@/lib/assignments";
import { checkRateLimitAsync, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Публичная выдача по коду: задания БЕЗ правильных ответов. Вход не нужен. */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  // Код — 6 цифр, а эндпоинт открыт: без лимита перебирались бы все выдачи
  // системы вместе с текстом заданий. Лимит по IP + по самому коду.
  const byIp = await checkRateLimitAsync(`assign:get:${clientIp(request)}`, 60, 60_000);
  if (!byIp.ok) return NextResponse.json({ error: "Слишком много запросов." }, { status: 429 });
  const byCode = await checkRateLimitAsync(`assign:get:code:${code}`, 120, 60_000);
  if (!byCode.ok) return NextResponse.json({ error: "Слишком много запросов." }, { status: 429 });

  try {
    const assignment = await getPublicAssignment(code);
    if (!assignment) return NextResponse.json({ error: "Выдача не найдена." }, { status: 404 });
    return NextResponse.json({ assignment }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Не удалось загрузить выдачу." }, { status: 503 });
  }
}
