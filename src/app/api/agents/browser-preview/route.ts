import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { checkPublicUrl, installRequestGuard } from "@/lib/agents/ssrf";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Текстовое превью внешней страницы для AI-агента.
 *
 * Раньше endpoint был открытым и не проверял адрес: через него дёргались
 * метаданные облака (`169.254.169.254`), локальная Mongo и любой внутренний
 * сервис, а ответ приходил текстом. Проверка адреса и перехват подзапросов
 * вынесены в `src/lib/agents/ssrf.ts` и используются совместно с
 * `/api/agents/browser-stream`.
 */
export async function GET(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const rl = await checkRateLimitAsync(`agent:browser:${auth.user.id}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Слишком много запросов. Подождите минуту." }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const target = searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  const checked = await checkPublicUrl(target);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: checked.status });
  }

  const { chromium } = await import("playwright");
  let browser: import("playwright").Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: "block" });
    const page = await context.newPage();
    await installRequestGuard(page, checked.url.origin);

    const resp = await page.goto(checked.url.toString(), { waitUntil: "domcontentloaded", timeout: 15_000 });
    const title = await page.title();
    const content = await page.evaluate(() => {
      document.querySelectorAll("script, style, nav, footer, iframe, noscript, svg").forEach((el) => el.remove());
      return document.body?.innerText?.substring(0, 3000) ?? "";
    });

    return NextResponse.json({ title, content, status: resp?.status() ?? null });
  } catch (error) {
    log.warn("browser-preview failed", {
      url: checked.url.origin,
      reason: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ title: checked.url.toString(), content: "Не удалось открыть страницу." });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
