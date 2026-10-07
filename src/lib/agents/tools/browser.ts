import { getAgentBrowserSession, persistAgentBrowserSession } from '../browser-session';
import { checkPublicUrl, installRequestGuard } from '../ssrf';

export const browserTools = {
  browserNavigate: async ({ url }: { url: string }, ctx?: { userId?: string }) => {
    if (typeof url !== 'string' || !ctx?.userId || !/^https?:\/\//i.test(url)) {
      return { success: false, error: 'Нужны пользовательская сессия и URL с http(s)://' };
    }
    try {
      const checked = await checkPublicUrl(url);
      if (!checked.ok) return { success: false, error: checked.error };
      const session = await getAgentBrowserSession(ctx.userId);
      await installRequestGuard(session.page);
      await session.page.goto(checked.url.toString(), { waitUntil: 'domcontentloaded', timeout: 15000 });
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
