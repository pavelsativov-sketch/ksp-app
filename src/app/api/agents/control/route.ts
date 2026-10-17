import { after, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getControlOwner, setControlOwner } from "@/lib/agents/session";
import { hasLiveAgentTask, resurrectStalePausedTask } from "@/lib/agents/orchestrator";
import { resolveControlOwner } from "@/lib/agents/lease";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Владелец управления рабочей средой: пользователь или AI-агент.
 *
 * Значение сверяем с фактом: если в базе значится «ai», но живой задачи нет
 * (раннер погиб по таймауту либо запись протухла), управление возвращаем
 * учителю и запоминаем это. Без такой сверки панель «AI работает» с кнопкой
 * «Забрать управление себе» висела у учителя часами после задачи.
 */
export async function GET() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const stored = await getControlOwner(auth.user.id);
  const owner = resolveControlOwner(stored, await hasLiveAgentTask(auth.user.id));
  if (owner !== stored) await setControlOwner(auth.user.id, owner).catch(() => {});
  return NextResponse.json(
    { control: owner },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** TAKE CONTROL / GIVE CONTROL TO AI. */
export async function POST(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  let body: { control?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.control !== "user" && body.control !== "ai") {
    return NextResponse.json({ error: "control должен быть 'user' или 'ai'" }, { status: 400 });
  }
  await setControlOwner(auth.user.id, body.control);
  if (body.control === "ai") {
    // Живой раннер сам увидит смену владельца. Мёртвый — отсюда перезапускаем:
    // так «Готово — продолжить с ИИ» работает и после долгой паузы учителя.
    await resurrectStalePausedTask(auth.user.id).catch(() => null);
  }
  return NextResponse.json({ ok: true, control: body.control }, { headers: { "Cache-Control": "no-store" } });
}
