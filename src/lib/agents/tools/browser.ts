import { getAgentBrowserSession, persistAgentBrowserSession } from '../browser-session';
import { checkPublicUrl, installRequestGuard } from '../ssrf';
import { getVercelSandbox } from '@/lib/workspace/runtime';
import { startSandboxBrowser, type BrowserSandbox } from '@/lib/agents/browser-sandbox';

export const browserTools = {
  browserNavigate: async ({ url }: { url: string }, ctx?: { userId?: string }) => {
    if (typeof url !== 'string' || !ctx?.userId || !/^https?:\/\//i.test(url)) {
      return { success: false, error: 'Нужны пользовательская сессия и URL с http(s)://' };
    }
    try {
      const checked = await checkPublicUrl(url);
      if (!checked.ok) return { success: false, error: checked.error };

      // Vercel Sandbox Playwright — без дневного лимита Cloudflare.
      // Worker запускается один раз на весь агентский run и переиспользуется
      // между вызовами browserNavigate (браузер остаётся живым в sandbox VM).
      const sandbox = await getVercelSandbox(ctx.userId).catch(() => null) as BrowserSandbox | null;
      if (sandbox) {
        try {
          const page = await startSandboxBrowser(sandbox, { currentUrl: checked.url.toString() });
          await page.goto(checked.url.toString(), { waitUntil: 'domcontentloaded', timeout: 25000 });
          const title = await page.title();
          const content = await page.evaluate(() => {
            const doc = window.document.cloneNode(true) as Document;
            doc.querySelectorAll('script, style, nav, footer, iframe').forEach((el) => el.remove());
            return (doc.body?.innerText ?? '').slice(0, 2000);
          }) as string;
          return { success: true, title, content };
        } catch (sbErr) {
          const errMsg = sbErr instanceof Error ? sbErr.message : String(sbErr);
          // В среде с Vercel Sandbox не падаем на Cloudflare (у Cloudflare лимит 10 мин/день уже исчерпан)
          return { success: false, error: `Ошибка браузера Sandbox: ${errMsg}` };
        }
      }

      // Фоллбэк: Cloudflare Browser Run (только для локальной разработки без Sandbox).
      const session = await getAgentBrowserSession(ctx.userId);
      await installRequestGuard(session.page);
      await session.page.goto(checked.url.toString(), { waitUntil: 'domcontentloaded', timeout: 25000 });
      await persistAgentBrowserSession(ctx.userId);
      const page = session.page;
      const title = await page.title();
      // Основной читаемый текст без скриптов и навигации.
      const content = await page.evaluate(() => {
        const doc = window.document.cloneNode(true) as Document;
        doc.querySelectorAll('script, style, nav, footer, iframe').forEach((el) => el.remove());
        return (doc.body?.innerText ?? '').slice(0, 2000);
      }) as string;
      return { success: true, title, content };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'navigation failed' };
    }
  },
};
