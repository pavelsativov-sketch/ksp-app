import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { checkPublicUrl, installRequestGuard } from "@/lib/agents/ssrf";
import { log } from "@/lib/logger";
import { browserFailure, clearAgentBrowserSession, getAgentBrowserSession, persistAgentBrowserSession, persistSandboxBrowserState, readStoredBrowserState } from "@/lib/agents/browser-session";
import { startSandboxBrowser, getSandboxBrowserState, inspectActiveField, detectPageAuthBarrier, type BrowserSandbox } from "@/lib/agents/browser-sandbox";
import { getVercelSandbox } from "@/lib/workspace/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Браузер рабочей области: скриншот текущей страницы + базовые действия.
 *
 * Что было не так:
 *  1) Роут вообще не требовал авторизации — любой аноним мог управлять
 *     браузером процесса (`?action=navigate&url=…`, `type`, `click`).
 *  2) URL не проверялся: `http://169.254.169.254/` (метаданные облака),
 *     `http://localhost:27017/` (Mongo) и любой внутренний сервис
 *     открывались и отдавались скриншотом. Это SSRF.
 *  3) Страница и браузер были глобальными (`global.__playwrightPage`), то
 *     есть сессия одного пользователя была видна другому: можно было
 *     дочитать его открытые страницы и печатать в его форме.
 *  4) Лимитов не было — можно было выжигать CPU/RAM сервера.
 *
 * Теперь: обязательная сессия, rate-limit, изолированный BrowserContext на
 * пользователя и запрет всех подзапросов, кроме проверенного origin.
 */

function searchUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (/\.[a-z]{2,}(\/|$)/i.test(trimmed)) return `https://${trimmed}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
}

type BrowserAction = { action?: string; url?: unknown; x?: unknown; y?: unknown; text?: unknown; key?: unknown; dy?: unknown };

async function authorize() {
  const auth = await requireApiAuth();
  if (auth.response) return { response: auth.response } as const;

  const rl = await checkRateLimitAsync(`agent:browser-stream:${auth.user.id}`, 60, 60_000);
  if (!rl.ok) {
    return { response: NextResponse.json(
      { error: "Слишком много обращений к браузеру. Подождите минуту." },
      { status: 429 },
    ) } as const;
  }
  return { userId: auth.user.id } as const;
}

async function runAction(userId: string, args: BrowserAction) {
  const action = args.action ?? "screenshot";

  // ── Vercel Sandbox Playwright (без дневного лимита Cloudflare) ────────────
  const sandbox = await getVercelSandbox(userId).catch(() => null) as BrowserSandbox | null;
  if (sandbox) {
    try {
      const stored = await readStoredBrowserState(userId).catch(() => undefined);
      const page = await startSandboxBrowser(sandbox, {
        storageState: stored?.storageState,
        currentUrl: stored?.currentUrl,
      });

      if (action === "warmup") {
        return NextResponse.json({ ok: true, url: page.url() });
      }

      if (action === "navigate") {
        const nav = searchUrl(typeof args.url === "string" ? args.url : "");
        const checked = await checkPublicUrl(nav);
        if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });
        await page.goto(checked.url.toString(), { timeout: 20_000 });
      } else if (action === "click") {
        const x = Number(args.x ?? 0);
        const y = Number(args.y ?? 0);
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= 1280 || y >= 800) {
          return NextResponse.json({ error: "Координаты клика вне страницы" }, { status: 400 });
        }
        await page.mouse.click(x, y);
        await page.waitForTimeout(300);
      } else if (action === "type") {
        const text = typeof args.text === "string" ? args.text.slice(0, 500) : "";
        if (!text) return NextResponse.json({ error: "Введите текст для страницы" }, { status: 400 });
        await page.keyboard.type(text);
      } else if (action === "key") {
        const key = typeof args.key === "string" ? args.key.slice(0, 30) : "Enter";
        if (!/^(?:[\w]+|Control\+[\w]+|Shift\+[\w]+|Alt\+[\w]+)$/.test(key)) {
          return NextResponse.json({ error: "Недопустимая клавиша" }, { status: 400 });
        }
        await page.keyboard.press(key);
        await page.waitForTimeout(300);
      } else if (action === "scroll") {
        const dy = Number(args.dy ?? 0);
        if (!Number.isFinite(dy)) return NextResponse.json({ error: "Некорректная прокрутка" }, { status: 400 });
        await page.mouse.wheel(0, Math.max(-2000, Math.min(2000, dy)));
        await page.waitForTimeout(200);
      } else if (action === "back") {
        await page.goBack({ timeout: 10_000 });
      } else if (action === "forward") {
        await page.goForward({ timeout: 10_000 });
      } else if (action === "reload") {
        await page.goto(page.url() || "about:blank", { timeout: 15_000 });
      } else if (action !== "screenshot") {
        return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
      }

      const [screenshot, title, activeField, authBarrier] = await Promise.all([
        page.screenshot({ type: "jpeg", quality: 80 }),
        page.title().catch(() => ""),
        inspectActiveField(page),
        detectPageAuthBarrier(page),
      ]);
      const currentUrl = page.url();

      // Сохраняем сессию (куки, localStorage, URL) в MongoDB после каждого действия
      if (action !== "screenshot") {
        const state = await getSandboxBrowserState(sandbox);
        await persistSandboxBrowserState(userId, state.storageState, state.currentUrl).catch(() => {});
      }

      return new NextResponse(new Uint8Array(screenshot as Uint8Array), {
        headers: {
          "Content-Type": "image/jpeg",
          "X-Page-Title": encodeURIComponent(title),
          "X-Page-Url": encodeURIComponent(currentUrl),
          "X-Active-Field": encodeURIComponent(JSON.stringify(activeField)),
          "X-Auth-Barrier": encodeURIComponent(JSON.stringify(authBarrier)),
          "Cache-Control": "no-store",
        },
      });
    } catch (sbErr) {
      const reason = sbErr instanceof Error ? sbErr.message : String(sbErr);
      log.error("browser-stream sandbox failed", { userId, action, reason });
      if (reason.includes("failed to start") || reason.includes("installation failed")) {
        return NextResponse.json(
          { error: "Браузер запускается (~15–30 сек при холодном старте). Подождите немного." },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: reason.slice(0, 200) }, { status: 502 });
    }
  }

  // ── Cloudflare Browser Run (фоллбэк без Sandbox) ──────────────────────────
  try {
    const session = await getAgentBrowserSession(userId);
    if (session.remote) {
      let remoteAction = action;
      let remoteArgs: Record<string, unknown> = {};
      let allowedOrigin: string | undefined;

      if (action === "navigate") {
        const nav = searchUrl(typeof args.url === "string" ? args.url : "");
        const checked = await checkPublicUrl(nav);
        if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });
        remoteArgs = { url: checked.url.toString(), timeoutMs: 20_000 };
        allowedOrigin = checked.url.origin;
      } else if (action === "click") {
        const x = Number(args.x ?? 0);
        const y = Number(args.y ?? 0);
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= 1280 || y >= 800) {
          return NextResponse.json({ error: "Координаты клика вне страницы" }, { status: 400 });
        }
        remoteArgs = { x, y };
      } else if (action === "type") {
        const text = typeof args.text === "string" ? args.text.slice(0, 500) : "";
        if (!text) return NextResponse.json({ error: "Введите текст для страницы" }, { status: 400 });
        remoteArgs = { text };
      } else if (action === "key") {
        const key = typeof args.key === "string" ? args.key.slice(0, 30) : "Enter";
        if (!/^(?:[\w]+|Control\+[\w]+|Shift\+[\w]+|Alt\+[\w]+)$/.test(key)) {
          return NextResponse.json({ error: "Недопустимая клавиша" }, { status: 400 });
        }
        remoteAction = "press";
        remoteArgs = { key };
      } else if (action === "scroll") {
        const dy = Number(args.dy ?? 0);
        if (!Number.isFinite(dy)) return NextResponse.json({ error: "Некорректная прокрутка" }, { status: 400 });
        remoteAction = "wheel";
        remoteArgs = { dx: 0, dy: Math.max(-2000, Math.min(2000, dy)) };
      } else if (["screenshot", "back", "forward", "reload"].includes(action)) {
        remoteArgs = {};
      } else {
        return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
      }

      const frame = await session.remote.performUiAction(remoteAction, remoteArgs, allowedOrigin);
      await persistAgentBrowserSession(userId);
      return new NextResponse(new Uint8Array(frame.screenshot), {
        headers: {
          "Content-Type": "image/jpeg",
          "X-Page-Title": encodeURIComponent(frame.title),
          "X-Page-Url": encodeURIComponent(frame.currentUrl),
          "Cache-Control": "no-store",
        },
      });
    }

    const { page } = session;

    let guardOrigin: string | null = null;

    if (action === "navigate") {
      const nav = searchUrl(typeof args.url === "string" ? args.url : "");
      const checked = await checkPublicUrl(nav);
      if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });
      guardOrigin = checked.url.origin;

      // Подзапросы самой страницы пропускаем только для проверенного origin.
      await installRequestGuard(page);
      await page.goto(checked.url.toString(), { waitUntil: "domcontentloaded", timeout: 20_000 });
    } else if (action === "click") {
      const x = Number(args.x ?? 0);
      const y = Number(args.y ?? 0);
      if (Number.isFinite(x) && Number.isFinite(y)) await page.mouse.click(x, y);
      await page.waitForTimeout(300);
    } else if (action === "type") {
      const text = (typeof args.text === "string" ? args.text : "").slice(0, 500);
      if (text) await page.keyboard.type(text, { delay: 10 });
    } else if (action === "key") {
      const key = (typeof args.key === "string" ? args.key : "Enter").slice(0, 30);
      if (/^(?:[\w]+|Control\+[\w]+|Shift\+[\w]+|Alt\+[\w]+)$/.test(key)) await page.keyboard.press(key);
      await page.waitForTimeout(400);
    } else if (action === "back") {
      await page.goBack({ waitUntil: "domcontentloaded", timeout: 10_000 }).catch(() => {});
    } else if (action === "forward") {
      await page.goForward({ waitUntil: "domcontentloaded", timeout: 10_000 }).catch(() => {});
    } else if (action === "reload") {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {});
    } else if (action === "scroll") {
      const dy = Number(args.dy ?? 0);
      if (Number.isFinite(dy)) await page.mouse.wheel(0, Math.max(-2000, Math.min(2000, dy)));
      await page.waitForTimeout(200);
    } else if (action !== "screenshot") {
      return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
    }

    if (guardOrigin === null) guardOrigin = new URL(page.url()).origin;
    await installRequestGuard(page);
    if (action !== "screenshot") await persistAgentBrowserSession(userId);

    const screenshot = await page.screenshot({ type: "jpeg", quality: 80 });
    const title = await page.title().catch(() => "");
    const currentUrl = page.url();

    return new NextResponse(new Uint8Array(screenshot), {
      headers: {
        "Content-Type": "image/jpeg",
        "X-Page-Title": encodeURIComponent(title),
        "X-Page-Url": encodeURIComponent(currentUrl),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    // Наружу — нейтральный текст: сообщения Playwright содержат внутренние
    // пути и версии, детали уходят в лог.
    log.error("browser-stream failed", {
      userId,
      action,
      reason: error instanceof Error ? error.message : String(error),
    });
    const failure = browserFailure(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}

/** GET is kept for screenshots and non-sensitive browser controls. */
export async function GET(req: Request) {
  const auth = await authorize();
  if ("response" in auth) return auth.response;
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") ?? "screenshot";
  // Never allow credentials to be sent in a URL, where proxies may log them.
  if (action === "type") return NextResponse.json({ error: "Ввод текста передавайте методом POST" }, { status: 405 });
  return runAction(auth.userId, {
    action,
    url: searchParams.get("url"),
    x: searchParams.get("x"),
    y: searchParams.get("y"),
    key: searchParams.get("key"),
    dy: searchParams.get("dy"),
  });
}

/** POST keeps typed login data out of query strings and access logs. */
export async function POST(req: Request) {
  const auth = await authorize();
  if ("response" in auth) return auth.response;
  let body: BrowserAction;
  try {
    body = await req.json() as BrowserAction;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  if (body.action === "type" && (typeof body.text !== "string" || body.text.length > 500)) {
    return NextResponse.json({ error: "Допустимо ввести до 500 символов" }, { status: 400 });
  }
  return runAction(auth.userId, body);
}

/** Завершить внешний сеанс и удалить зашифрованные cookies пользователя. */
export async function DELETE() {
  const auth = await authorize();
  if ("response" in auth) return auth.response;
  await clearAgentBrowserSession(auth.userId);
  return NextResponse.json({ ok: true });
}
