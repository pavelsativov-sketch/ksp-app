import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { checkPublicUrl, installRequestGuard } from "@/lib/agents/ssrf";
import { log } from "@/lib/logger";
import type { Browser, BrowserContext, Page } from "playwright";

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

interface Session {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  userId: string;
  lastSeen: number;
}

const SESSION_TTL_MS = 5 * 60_000;
const sessions = new Map<string, Session>();

/** Разрывает сессии, к которым давно не обращались. */
function reapSessions(now = Date.now()): void {
  for (const [userId, session] of sessions) {
    if (now - session.lastSeen < SESSION_TTL_MS) continue;
    sessions.delete(userId);
    void session.context.close().catch(() => {});
    void session.browser.close().catch(() => {});
  }
}

async function getSession(userId: string): Promise<Session> {
  const now = Date.now();
  reapSessions(now);

  const existing = sessions.get(userId);
  if (existing && !existing.browser.isConnected() && !existing.page.isClosed()) {
    existing.lastSeen = now;
    return existing;
  }
  if (existing) {
    sessions.delete(userId);
    await existing.context.close().catch(() => {});
    await existing.browser.close().catch(() => {});
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  // Свой контекст на пользователя: отдельные cookie, localStorage и история.
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    javaScriptEnabled: false,
    serviceWorkers: "block",
  });
  const page = await context.newPage();

  const session: Session = { browser, context, page, userId, lastSeen: now };
  sessions.set(userId, session);
  return session;
}

function searchUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (/\.[a-z]{2,}(\/|$)/i.test(trimmed)) return `https://${trimmed}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
}

// GET /api/agents/browser-stream?action=screenshot
// GET /api/agents/browser-stream?action=navigate&url=…
// GET /api/agents/browser-stream?action=click&x=100&y=200
// GET /api/agents/browser-stream?action=type&text=…
// GET /api/agents/browser-stream?action=key&key=Enter
// GET /api/agents/browser-stream?action=back|forward|reload|scroll&dy=300
export async function GET(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const rl = await checkRateLimitAsync(`agent:browser-stream:${auth.user.id}`, 40, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Слишком много обращений к браузеру. Подождите минуту." },
      { status: 429 },
    );
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") ?? "screenshot";

  try {
    const session = await getSession(auth.user.id);
    const { page } = session;

    let guardOrigin: string | null = null;

    if (action === "navigate") {
      const nav = searchUrl(searchParams.get("url") ?? "");
      const checked = await checkPublicUrl(nav);
      if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });
      guardOrigin = checked.url.origin;

      // Подзапросы самой страницы пропускаем только для проверенного origin.
      await installRequestGuard(page, guardOrigin);
      await page.goto(checked.url.toString(), { waitUntil: "domcontentloaded", timeout: 20_000 });
    } else if (action === "click") {
      const x = Number.parseInt(searchParams.get("x") ?? "0", 10);
      const y = Number.parseInt(searchParams.get("y") ?? "0", 10);
      if (Number.isFinite(x) && Number.isFinite(y)) await page.mouse.click(x, y);
      await page.waitForTimeout(300);
    } else if (action === "type") {
      const text = (searchParams.get("text") ?? "").slice(0, 500);
      if (text) await page.keyboard.type(text, { delay: 10 });
    } else if (action === "key") {
      const key = (searchParams.get("key") ?? "Enter").slice(0, 30);
      if (/^[\w]+$/.test(key)) await page.keyboard.press(key);
      await page.waitForTimeout(400);
    } else if (action === "back") {
      await page.goBack({ waitUntil: "domcontentloaded", timeout: 10_000 }).catch(() => {});
    } else if (action === "forward") {
      await page.goForward({ waitUntil: "domcontentloaded", timeout: 10_000 }).catch(() => {});
    } else if (action === "reload") {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {});
    } else if (action === "scroll") {
      const dy = Number.parseInt(searchParams.get("dy") ?? "0", 10);
      if (Number.isFinite(dy)) await page.mouse.wheel(0, Math.max(-2000, Math.min(2000, dy)));
      await page.waitForTimeout(200);
    } else if (action !== "screenshot") {
      return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
    }

    if (guardOrigin === null) guardOrigin = new URL(page.url()).origin;
    await installRequestGuard(page, guardOrigin);

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
      userId: auth.user.id,
      action,
      reason: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Не удалось выполнить действие в браузере" }, { status: 502 });
  }
}
