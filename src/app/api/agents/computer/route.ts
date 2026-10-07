import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { checkPublicUrl, installRequestGuard } from "@/lib/agents/ssrf";
import { getControlOwner } from "@/lib/agents/session";
import { runComputerUse, type AgentPage, type LoopEvent } from "@/lib/agents/computer/loop";
import {
  listPending,
  waitForConfirmation,
  type ConfirmationRequest,
} from "@/lib/agents/computer/confirm";
import { log } from "@/lib/logger";
import { browserFailure, getAgentBrowserSession, persistAgentBrowserSession } from "@/lib/agents/browser-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Агент «Использование компьютера».
 *
 * Управляет браузером по снимкам экрана: модель смотрит на экран, предлагает
 * действие, цикл выполняет его и показывает новый снимок. Опасные действия
 * (отправка, оплата, вход, удаление) останавливаются и ждут подтверждения
 * учителя.
 *
 * Безопасность складывается из четырёх независимых слоёв, и каждый нужен
 * сам по себе:
 *   1) авторизация — анонимный посетитель не управляет браузером;
 *   2) rate-limit — иначе можно выжечь CPU выжиганием циклов;
 *   3) изолированный BrowserContext на пользователя — сессии не пересекаются;
 *   4) политики безопасности + SSRF-фильтр — то, что агент вообще делает.
 */

const MAX_TURNS = 25;

/** Живой цикл, выполняемый прямо в этом запросе. */
const running = new Map<string, { startedAt: number; goal: string }>();

export async function POST(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const userId = auth.user.id;

  // Без rate-limit агент с промптом «прокрути 500 раз» съест процессор
  // сервера целиком: каждый ход — это запрос к модели плюс снимок экрана.
  const rl = await checkRateLimitAsync(`agent:computer:${userId}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Слишком много запусков агента. Подождите минуту." },
      { status: 429 },
    );
  }

  let body: { goal?: unknown; startUrl?: unknown };
  try {
    body = (await req.json()) as { goal?: unknown; startUrl?: unknown };
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  if (goal.length < 3) {
    return NextResponse.json({ error: "Опишите задачу подробнее" }, { status: 400 });
  }

  if (running.has(userId)) {
    return NextResponse.json(
      { error: "Агент уже работает. Дождитесь окончания или остановите его." },
      { status: 409 },
    );
  }

  const events: LoopEvent[] = [];
  running.set(userId, { startedAt: Date.now(), goal: goal.slice(0, 200) });

  try {
    const session = await getAgentBrowserSession(userId);

    // Стартовая страница: её агент тоже открывает через безопасный путь.
    if (typeof body.startUrl === "string" && body.startUrl.trim()) {
      const checked = await checkPublicUrl(body.startUrl.trim());
      if (!checked.ok) {
        return NextResponse.json({ error: checked.error }, { status: checked.status });
      }
      await installRequestGuard(session.page);
      await session.page.goto(checked.url.toString(), { waitUntil: "domcontentloaded", timeout: 20_000 });
    }

    const agentPage = session.page as unknown as AgentPage;

    const summary = await runComputerUse({
      page: agentPage,
      goal,
      userId,
      maxTurns: MAX_TURNS,
      log: async (event) => {
        events.push(event);
        log.info(`[computer-use] ${event.message}`, { userId, type: event.type });
      },
      checkUrl: async (url) => {
        const checked = await checkPublicUrl(url);
        if (!checked.ok) return { ok: false, error: checked.error };
        // Подзапросы страницы пропускаем только для проверенного origin.
        await installRequestGuard(session.page);
        return { ok: true, url: checked.url.toString() };
      },
      confirm: (action, decision, probe) =>
        // Запрос подтверждения живёт в отдельном модуле: его читает
        // интерфейс по запросу и отвечает отдельным POST.
        waitForConfirmation(userId, action, decision, probe),
      shouldPause: async () => await getControlOwner(userId) === "user",
    });

    await persistAgentBrowserSession(userId);

    return NextResponse.json({ ok: true, summary, events });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error("computer-use failed", { userId, reason });
    const failure = browserFailure(error);
    const message = failure.status === 429 ? failure.message : "Агент не смог выполнить задачу";
    return NextResponse.json({ error: message, events, detail: reason.slice(0, 300) }, { status: failure.status === 429 ? 429 : 502 });
  } finally {
    running.delete(userId);
  }
}

/** Список действий, ждущих подтверждения учителя. */
export async function GET(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  if (new URL(req.url).searchParams.get("action") === "screenshot") {
    const session = await getAgentBrowserSession(auth.user.id).catch(() => null);
    if (!session || !session.browser.isConnected() || session.page.isClosed()) {
      return NextResponse.json({ error: "Сессия браузера не запущена" }, { status: 404 });
    }
    try {
      session.lastSeen = Date.now();
      const screenshot = await session.page.screenshot({ type: "jpeg", quality: 70 });
      return new NextResponse(new Uint8Array(screenshot), {
        headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" },
      });
    } catch {
      return NextResponse.json({ error: "Не удалось получить снимок браузера" }, { status: 502 });
    }
  }

  const pending: ConfirmationRequest[] = await listPending(auth.user.id);
  return NextResponse.json({ pending, running: running.has(auth.user.id) });
}
