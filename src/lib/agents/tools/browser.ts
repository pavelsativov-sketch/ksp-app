// Ленивый импорт playwright: без браузеров пакет не должен ронять модуль.
type Page = { goto: (url: string, o?: object) => Promise<unknown>; title: () => Promise<string>; evaluate: (fn: () => string) => Promise<string> };

let pagePromise: Promise<Page | null> | null = null;

async function getPage(): Promise<Page | null> {
  if (!pagePromise) {
    pagePromise = (async () => {
      try {
        const { chromium } = await import('playwright');
        const browser = await chromium.launch({ headless: true });
        return (await browser.newPage()) as unknown as Page;
      } catch {
        return null; // браузеры не установлены — инструмент честно вернёт ошибку
      }
    })();
  }
  return pagePromise;
}

export const browserTools = {
  navigateBrowser: async ({ url }: { url: string }) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return { success: false, error: 'URL должен начинаться с http(s)://' };
    }
    const page = await getPage();
    if (!page) {
      return { success: false, error: 'Браузер недоступен (не установлены браузеры Playwright)' };
    }
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const title = await page.title();
      // Основной читаемый текст без скриптов и навигации.
      const content = await page.evaluate(() => {
        const doc = window.document;
        doc.querySelectorAll('script, style, nav, footer, iframe').forEach((el) => el.remove());
        return (doc.body?.innerText ?? '').slice(0, 2000);
      }) as string;
      return { success: true, title, content };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'navigation failed' };
    }
  },
};
