import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { checkPublicUrl, installRequestGuard } from "@/lib/agents/ssrf";
import { getControlOwner, setControlOwner } from "@/lib/agents/session";
import { runComputerUse, type AgentPage, type LoopEvent } from "@/lib/agents/computer/loop";
import {
  listPending,
  waitForConfirmation,
  type ConfirmationRequest,
} from "@/lib/agents/computer/confirm";
import { log } from "@/lib/logger";
import {
  browserFailure,
  getAgentBrowserSession,
  persistAgentBrowserSession,
  persistSandboxBrowserState,
  readStoredBrowserState,
} from "@/lib/agents/browser-session";
import {
  startSandboxBrowser,
  getSandboxBrowserState,
  inspectActiveField,
  detectPageAuthBarrier,
  type BrowserSandbox,
  type PageAuthBarrier,
} from "@/lib/agents/browser-sandbox";
import { getVercelSandbox } from "@/lib/workspace/runtime";

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

/** Живой цикл, выполняемый прямо в этом запросе. */
const running = new Map<
  string,
  {
    startedAt: number;
    goal: string;
    events: LoopEvent[];
    authBarrier: PageAuthBarrier | null;
  }
>();

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

  if (running.has(userId)) {
    return NextResponse.json(
      { error: "Агент уже работает. Дождитесь окончания или остановите его." },
      { status: 409 },
    );
  }

  const events: LoopEvent[] = [];
  const runState = {
    startedAt: Date.now(),
    goal: goal.slice(0, 200),
    events,
    authBarrier: null as PageAuthBarrier | null,
  };
  running.set(userId, runState);
  await setControlOwner(userId, "ai").catch(() => {});

  const sandbox = await getVercelSandbox(userId).catch(() => null) as BrowserSandbox | null;

  try {
    if (sandbox) {
      // ── Vercel Sandbox: Playwright внутри VM ──────────────────────────────
      const stored = await readStoredBrowserState(userId).catch(() => null);
      const { isBilimClassContext } = await import("@/lib/agents/domain-skills/bilimclass");
      const fallbackStartUrl = isBilimClassContext(goal, "")
        ? "https://www.bilimclass.kz/2026/frontoffice/dashboard"
        : undefined;
      const requestedStartUrl =
        typeof body.startUrl === "string" && body.startUrl.trim()
          ? body.startUrl.trim()
          : stored?.currentUrl && stored.currentUrl !== "about:blank"
            ? stored.currentUrl
            : fallbackStartUrl;

      let agentPage: AgentPage;
      try {
        agentPage = await startSandboxBrowser(sandbox, {
          storageState: stored?.storageState,
          currentUrl: requestedStartUrl,
        });
      } catch (initErr) {
        const reason = initErr instanceof Error ? initErr.message : String(initErr);
        log.error("sandbox browser init failed", { userId, reason });
        return NextResponse.json(
          { error: `Не удалось запустить браузер в песочнице: ${reason.slice(0, 200)}`, events },
          { status: 502 },
        );
      }

      const summary = await runComputerUse({
        page: agentPage,
        goal,
        userId,
        maxTurns: MAX_TURNS,
        log: async (event) => {
          events.push(event);
          if (event.type === "RESUMED") {
            runState.authBarrier = null;
            await setControlOwner(userId, "ai").catch(() => {});
            const st = await getSandboxBrowserState(sandbox).catch(() => null);
            if (st) {
              await persistSandboxBrowserState(userId, st.storageState, st.currentUrl).catch(() => {});
            }
          }
          log.info(`[computer-use:sandbox] ${event.message}`, { userId, type: event.type });
        },
        checkUrl: async (url) => {
          const checked = await checkPublicUrl(url);
          if (!checked.ok) return { ok: false, error: checked.error };
          return { ok: true, url: checked.url.toString() };
        },
        confirm: (action, decision, probe) => waitForConfirmation(userId, action, decision, probe),
        onAuthBarrier: async (barrier) => {
          runState.authBarrier = barrier;
          await setControlOwner(userId, "user");
        },
        shouldPause: async () => (await getControlOwner(userId)) === "user",
      });

      // Сохраняем сессию (куки, localStorage, URL) в MongoDB и оставляем воркер
      // живым, чтобы учитель мог сразу продолжить в рабочей области ОС без холодного старта
      const finalState = await getSandboxBrowserState(sandbox);
      await persistSandboxBrowserState(userId, finalState.storageState, finalState.currentUrl).catch(() => {});

      return NextResponse.json({ ok: true, summary, events });
    }

    // ── Playwright / Browser Run (фоллбэк без Sandbox) ────────────────────
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
        if (event.type === "RESUMED") {
          runState.authBarrier = null;
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
        runState.authBarrier = barrier;
        await setControlOwner(userId, "user");
      },
      shouldPause: async () => (await getControlOwner(userId)) === "user",
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

/** Список действий, ждущих подтверждения учителя, и текущий снимок экрана. */
export async function GET(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const userId = auth.user.id;

  if (new URL(req.url).searchParams.get("action") === "screenshot") {
    const sandbox = await getVercelSandbox(userId).catch(() => null) as BrowserSandbox | null;
    if (sandbox) {
      try {
        const stored = await readStoredBrowserState(userId).catch(() => null);
        const page = await startSandboxBrowser(sandbox, {
          storageState: stored?.storageState,
          currentUrl: stored?.currentUrl,
        });
        const screenshot = await page.screenshot({ type: "jpeg", quality: 75 });
        const title = await page.title().catch(() => "");
        const activeField = await inspectActiveField(page);
        const authBarrier = await detectPageAuthBarrier(page);
        return new NextResponse(Buffer.from(screenshot), {
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "no-store",
            "X-Page-Title": encodeURIComponent(title),
            "X-Page-Url": encodeURIComponent(page.url()),
            "X-Active-Field": encodeURIComponent(JSON.stringify(activeField)),
            "X-Auth-Barrier": encodeURIComponent(JSON.stringify(authBarrier)),
          },
        });
      } catch {
        return NextResponse.json({ error: "Не удалось получить снимок браузера в песочнице" }, { status: 502 });
      }
    }

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

  const pending: ConfirmationRequest[] = await listPending(userId);
  const state = running.get(userId);
  const control = await getControlOwner(userId);
  return NextResponse.json({
    pending,
    running: Boolean(state),
    events: state?.events ?? [],
    authBarrier: state?.authBarrier ?? null,
    control,
  });
}

