import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { checkPublicUrl } from "@/lib/agents/ssrf";
import { log } from "@/lib/logger";
import {
  browserFailure,
  clearAgentBrowserSession,
  getAgentBrowserSession,
  persistAgentBrowserSession,
} from "@/lib/agents/browser-session";
import { inspectActiveField, detectPageAuthBarrier } from "@/lib/agents/browser-dom";
import { tryAutoLogin, KNOWN_LOGIN_SITES } from "@/lib/agents/browser-autologin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Браузер рабочей области ОС — прямой Playwright через Codespaces runner.
 *
 * Архитектура:
 *   Vercel (edge) → этот роут → BROWSER_RPC_URL (Codespaces 16GB) → Chromium.
 *
 * Cloudflare Browser Run и Vercel Sandbox убраны:
 *   - Cloudflare: 10 мин/день, виснет, нет DOM-инспекции.
 *   - Vercel Sandbox: getOrCreate() висит несколько секунд даже при ошибке.
 *   - Codespaces 16GB: без лимитов, мгновенный старт, полный Playwright.
 */

function searchUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (/\.[a-z]{2,}(\/|$)/i.test(trimmed)) return `https://${trimmed}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
}

type BrowserAction = {
  action?: string;
  url?: unknown;
  x?: unknown;
  y?: unknown;
  text?: unknown;
  key?: unknown;
  dy?: unknown;
};

async function authorize() {
  const auth = await requireApiAuth();
  if (auth.response) return { response: auth.response } as const;

  const rl = await checkRateLimitAsync(`agent:browser-stream:${auth.user.id}`, 240, 60_000);
  if (!rl.ok) {
    return {
      response: NextResponse.json(
        { error: "Слишком много обращений к браузеру. Подождите минуту." },
        { status: 429 },
      ),
    } as const;
  }
  return { userId: auth.user.id } as const;
}

async function runAction(userId: string, args: BrowserAction) {
  const action = args.action ?? "screenshot";

  try {
    // Единственный backend — Codespaces runner через BROWSER_RPC_URL
    const session = await getAgentBrowserSession(userId);

    if (session.remote) {
      // ── Remote path: всё через browserRpc → Codespaces ──────────────────
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
      } else if (!["screenshot", "back", "forward", "reload"].includes(action)) {
        return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
      }

      const frame = await session.remote.performUiAction(remoteAction, remoteArgs, allowedOrigin);
      if (action !== "screenshot") await persistAgentBrowserSession(userId);

      // Авто-вход: если перешли на страницу входа известного сайта — заполняем форму автоматически
      let autoFrame = frame;
      if (action === "navigate") {
        const navigatedUrl = frame.currentUrl || "";
        const hostname = (() => { try { return new URL(navigatedUrl).hostname.replace(/^www\./, ""); } catch { return ""; } })();
        const navPath = (() => { try { return new URL(navigatedUrl).pathname; } catch { return ""; } })();
        const site = hostname ? KNOWN_LOGIN_SITES[hostname] : undefined;
        const isLoginPage = site && (!site.loginPath || navPath.startsWith(site.loginPath));
        if (isLoginPage) {
          const sendRpc = async (act: string, rpcArgs: Record<string, unknown>) => {
            await session.remote!.performUiAction(act, rpcArgs).catch(() => {});
          };
          const didLogin = await tryAutoLogin(userId, navigatedUrl, sendRpc);
          if (didLogin) {
            // Берём финальный скриншот после входа
            autoFrame = await session.remote.performUiAction("screenshot", {}).catch(() => frame);
            await persistAgentBrowserSession(userId);
          }
        }
      }

      // Runner умеет отдавать DOM через `evaluate`, поэтому рамка активного
      // поля и баннер авторизации работают и на удалённой сессии. Раньше
      // здесь были константы EMPTY_* — оверлей ввода и подсказка «войдите
      // сами» не появлялись никогда.
      const [activeField, authBarrier] = await Promise.all([
        inspectActiveField(session.page),
        detectPageAuthBarrier(session.page),
      ]);

      return new NextResponse(new Uint8Array(autoFrame.screenshot), {
        headers: {
          "Content-Type": "image/jpeg",
          "X-Page-Title": encodeURIComponent(autoFrame.title),
          "X-Page-Url": encodeURIComponent(autoFrame.currentUrl),
          "X-Active-Field": encodeURIComponent(JSON.stringify(activeField)),
          "X-Auth-Barrier": encodeURIComponent(JSON.stringify(authBarrier)),
          "Cache-Control": "no-store",
        },
      });
    }

    // ── Local path: Playwright запущен локально (dev / тест) ─────────────────
    const { page } = session;

    let guardUrl = "";
    if (action === "navigate") {
      const nav = searchUrl(typeof args.url === "string" ? args.url : "");
      const checked = await checkPublicUrl(nav);
      if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });
      guardUrl = checked.url.toString();
      await page.goto(guardUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
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

    if (action !== "screenshot") await persistAgentBrowserSession(userId);

    // Авто-вход для local/Sandbox пути через Playwright page.fill()
    if (action === "navigate") {
      const currentUrl = page.url();
      const hostname = (() => { try { return new URL(currentUrl).hostname.replace(/^www\./, ""); } catch { return ""; } })();
      const site = hostname ? KNOWN_LOGIN_SITES[hostname] : undefined;
      const navPath = (() => { try { return new URL(currentUrl).pathname; } catch { return ""; } })();
      const isLoginPage = site && (!site.loginPath || navPath.startsWith(site.loginPath));
      if (isLoginPage) {
        const sendRpc = async (act: string, rpcArgs: Record<string, unknown>) => {
          if (act === "fill") {
            const sel = String(rpcArgs.selector ?? "");
            const val = String(rpcArgs.value ?? "");
            if (sel && val) await page.locator(sel).first().fill(val, { timeout: 5000 }).catch(() => {});
          } else if (act === "press") {
            await page.keyboard.press(String(rpcArgs.key ?? "Enter")).catch(() => {});
          } else if (act === "wait") {
            await page.waitForTimeout(Math.min(Number(rpcArgs.ms ?? 500), 5000));
          } else if (act === "evaluate") {
            await page.evaluate(String(rpcArgs.script ?? "null")).catch(() => {});
          }
        };
        await tryAutoLogin(userId, currentUrl, sendRpc);
        await persistAgentBrowserSession(userId);
      }
    }

    const [screenshot, title, activeField, authBarrier] = await Promise.all([
      page.screenshot({ type: "jpeg", quality: 80 }),
      page.title().catch(() => ""),
      inspectActiveField(page),
      detectPageAuthBarrier(page),
    ]);

    return new NextResponse(new Uint8Array(screenshot), {
      headers: {
        "Content-Type": "image/jpeg",
        "X-Page-Title": encodeURIComponent(title),
        "X-Page-Url": encodeURIComponent(page.url()),
        "X-Active-Field": encodeURIComponent(JSON.stringify(activeField)),
        "X-Auth-Barrier": encodeURIComponent(JSON.stringify(authBarrier)),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    log.error("browser-stream failed", {
      userId,
      action,
      reason: error instanceof Error ? error.message : String(error),
    });
    const failure = browserFailure(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}

/** GET — скриншот и несенситивные действия. */
export async function GET(req: Request) {
  const auth = await authorize();
  if ("response" in auth) return auth.response;
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") ?? "screenshot";
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

/** POST — типизированный ввод логина/пароля вне query string. */
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

/** Завершить сеанс и удалить сохранённые cookies. */
export async function DELETE() {
  const auth = await authorize();
  if ("response" in auth) return auth.response;
  await clearAgentBrowserSession(auth.userId);
  return NextResponse.json({ ok: true });
}
