import { getVercelSandbox } from '@/lib/workspace/runtime';
import { startSandboxBrowser, type BrowserSandbox } from '@/lib/agents/browser-sandbox';
import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { checkPublicUrl, installRequestGuard } from "@/lib/agents/ssrf";
import { log } from "@/lib/logger";
import { browserFailure, getAgentBrowserSession, persistAgentBrowserSession } from "@/lib/agents/browser-session";

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

  try {
    const sandbox = await getVercelSandbox(auth.user.id).catch(() => null) as BrowserSandbox | null;
    if (sandbox) {
      const page = await startSandboxBrowser(sandbox, { currentUrl: checked.url.toString() });
      await page.goto(checked.url.toString(), { waitUntil: "domcontentloaded", timeout: 20_000 });
      const title = await page.title();
      const content = await page.evaluate(() => {
        document.querySelectorAll("script, style, nav, footer, iframe, noscript, svg").forEach((el) => el.remove());
        return document.body?.innerText?.substring(0, 3000) ?? "";
      });
      return NextResponse.json({ url: checked.url.toString(), title, content });
    }
    const session = await getAgentBrowserSession(auth.user.id);
    await installRequestGuard(session.page);

    const resp = await session.page.goto(checked.url.toString(), { waitUntil: "domcontentloaded", timeout: 15_000 });
    const title = await session.page.title();
    const content = await session.page.evaluate(() => {
      document.querySelectorAll("script, style, nav, footer, iframe, noscript, svg").forEach((el) => el.remove());
      return document.body?.innerText?.substring(0, 3000) ?? "";
    });
    await persistAgentBrowserSession(auth.user.id);

    return NextResponse.json({ title, content, status: resp?.status() ?? null });
  } catch (error) {
    log.warn("browser-preview failed", {
      url: checked.url.origin,
      reason: error instanceof Error ? error.message : String(error),
    });
    const failure = browserFailure(error);
    return NextResponse.json({ error: failure.message, title: checked.url.toString(), content: "" }, { status: failure.status });
  }
}
