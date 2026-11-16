import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// При первом прогреве ставятся Chromium и системные зависимости. Дефолтного
// лимита route handler недостаточно; browser-stream использует тот же лимит.
export const maxDuration = 300;

/**
 * Keepalive для браузера рабочей области ОС.
 *
 * Вкладка «Браузер» пингует его каждые 10 минут, чтобы прогреть
 * персональную Vercel Sandbox: у неё короткий TTL, и без пингов она
 * успевает остыть между занятиями.
 *
 * Эндпоинт всегда требует авторизации. Раньше неавторизованный запрос
 * получал 200 «sandbox-ready» — то есть либо ложный успех, либо способ
 * бесконечно дёргать точку входа без прав.
 */
export async function GET() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  try {
    const { getSandboxBrowserRpcUrl } = await import("@/lib/agents/sandbox-browser-service");
    await getSandboxBrowserRpcUrl(auth.user.id);
    // Сам Chrome и сохранённый вход поднимаются при создании сессии. Без этого
    // раннер уже отвечал, а первая команда агенту всё равно ждала около 50 с.
    const { getAgentBrowserSession } = await import("@/lib/agents/browser-session");
    await getAgentBrowserSession(auth.user.id);
    // Внутренний адрес песочницы наружу не отдаём: это инфраструктура,
    // а RPC всё равно защищён HMAC-подписью.
    return NextResponse.json({ status: "ok", runner: "alive" });
  } catch (e) {
    // Песочница ещё прогревается — это ожидаемое состояние, не ошибка.
    return NextResponse.json({
      status: "warming_up",
      reason: e instanceof Error ? e.message : String(e),
    });
  }
}
