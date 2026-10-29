import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { checkPublicUrl, installRequestGuard } from "@/lib/agents/ssrf";
import { getControlOwner, setControlOwner } from "@/lib/agents/session";
import { runComputerUse, type AgentPage, type LoopEvent } from "@/lib/agents/computer/loop";
import {
  cancelAll,
  listPending,
  waitForConfirmation,
  type ConfirmationRequest,
} from "@/lib/agents/computer/confirm";
import {
  beginRun,
  endRun,
  getRunState,
  isRunStopRequested,
  pushRunEvent,
  requestRunStop,
  setRunAuthBarrier,
} from "@/lib/agents/computer/run-state";
import { log } from "@/lib/logger";
import {
  browserFailure,
  getAgentBrowserSession,
  persistAgentBrowserSession,
} from "@/lib/agents/browser-session";
import {
  inspectActiveField,
  detectPageAuthBarrier,
  type PageAuthBarrier,
} from "@/lib/agents/browser-dom";

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
 */

const MAX_TURNS = 25;

export async function POST(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const userId = auth.user.id;

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

  // Слот запуска занимается в Mongo: так второй запуск (и со второго инстанса
  // функции) получает 409, а «Остановить» видит работающего агента.
  const slot = await beginRun(userId, goal);
  if (!slot) {
    return NextResponse.json(
      { error: "Агент уже работает. Дождитесь окончания или остановите его." },
      { status: 409 },
    );
  }
  const events: LoopEvent[] = [];
  await setControlOwner(userId, "ai").catch(() => {});

  try {
    // Один браузер на всю ОС: агент и учитель видят одну и ту же сессию.
    const session = await getAgentBrowserSession(userId);
    const { isBilimClassContext } = await import("@/lib/agents/domain-skills/bilimclass");
    const effectiveStartUrl =
      typeof body.startUrl === "string" && body.startUrl.trim()
        ? body.startUrl.trim()
        : (!session.page.url() || session.page.url() === "about:blank") && isBilimClassContext(goal, "")
          ? "https://www.bilimclass.kz/2026/frontoffice/dashboard"
          : "";

    if (effectiveStartUrl) {
      const checked = await checkPublicUrl(effectiveStartUrl);
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
        await pushRunEvent(userId, event).catch(() => {});
        if (event.type === "RESUMED") {
          await setRunAuthBarrier(userId, null).catch(() => {});
          await setControlOwner(userId, "ai").catch(() => {});
          await persistAgentBrowserSession(userId).catch(() => {});
        }
        log.info(`[computer-use] ${event.message}`, { userId, type: event.type });
      },
      checkUrl: async (url) => {
        const checked = await checkPublicUrl(url);
        if (!checked.ok) return { ok: false, error: checked.error };
        await installRequestGuard(session.page);
        return { ok: true, url: checked.url.toString() };
      },
      confirm: (action, decision, probe) =>
        waitForConfirmation(userId, action, decision, probe),
      onAuthBarrier: async (barrier) => {
        await setRunAuthBarrier(userId, barrier).catch(() => {});
        await setControlOwner(userId, "user");
      },
      shouldPause: async () => (await getControlOwner(userId)) === "user",
      isStopped: () => isRunStopRequested(userId).catch(() => false),
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
    await endRun(userId).catch(() => {});
  }
}

/** Список действий, ждущих подтверждения учителя, и текущий снимок экрана. */
export async function GET(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const userId = auth.user.id;

  if (new URL(req.url).searchParams.get("action") === "screenshot") {
    const session = await getAgentBrowserSession(userId).catch(() => null);
    if (!session || !session.browser.isConnected() || session.page.isClosed()) {
      return NextResponse.json({ error: "Сессия браузера не запущена" }, { status: 404 });
    }
    try {
      session.lastSeen = Date.now();
      const [screenshot, title, activeField, authBarrier] = await Promise.all([
        session.page.screenshot({ type: "jpeg", quality: 70 }),
        session.page.title().catch(() => ""),
        inspectActiveField(session.page),
        detectPageAuthBarrier(session.page),
      ]);
      return new NextResponse(new Uint8Array(screenshot), {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "no-store",
          "X-Page-Title": encodeURIComponent(title),
          "X-Page-Url": encodeURIComponent(session.page.url()),
          "X-Active-Field": encodeURIComponent(JSON.stringify(activeField)),
          "X-Auth-Barrier": encodeURIComponent(JSON.stringify(authBarrier)),
        },
      });
    } catch {
      return NextResponse.json({ error: "Не удалось получить снимок браузера" }, { status: 502 });
    }
  }

  const pending: ConfirmationRequest[] = await listPending(userId).catch(() => []);
  const state = await getRunState(userId).catch(() => null);
  const control = await getControlOwner(userId);
  return NextResponse.json({
    pending,
    running: state?.active === true,
    events: state?.events ?? [],
    authBarrier: state?.authBarrier ?? null,
    control,
  });
}

/**
 * Остановить работающего агента. Раньше сообщение «остановите его» отсылало к
 * несуществующей кнопке: цикл поддерживал остановку, но маршрут её не передавал.
 */
export async function DELETE() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const userId = auth.user.id;

  const stopped = await requestRunStop(userId);
  if (!stopped) return NextResponse.json({ ok: true, running: false });

  // Ожидающие подтверждения отклоняем сразу, а не через 2 минуты тайм-аута.
  await cancelAll(userId).catch(() => {});
  // Если агент стоял на паузе у учителя, возвращаем управление ИИ, иначе
  // цикл ждал бы ответа вместо того, чтобы завершиться.
  await setControlOwner(userId, "ai").catch(() => {});
  await pushRunEvent(userId, { type: "END", message: "Остановлено пользователем" }).catch(() => {});
  return NextResponse.json({ ok: true, running: true, stopping: true });
}
