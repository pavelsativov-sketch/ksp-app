import {
  getAgentBrowserSession,
  persistAgentBrowserSession,
  persistSandboxBrowserState,
  readStoredBrowserState,
} from '../browser-session';
import { checkPublicUrl, installRequestGuard } from '../ssrf';
import { getVercelSandbox } from '@/lib/workspace/runtime';
import {
  startSandboxBrowser,
  getSandboxBrowserState,
  detectPageAuthBarrier,
  type BrowserSandbox,
} from '@/lib/agents/browser-sandbox';
import {
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  denormalize,
  probeElement,
  readInteractables,
} from '@/lib/agents/computer/screen';
import { classifyClick, classifyTyping } from '@/lib/agents/computer/safety';
import { requestPermission } from '@/lib/agents/permissions';

async function extractPageSnapshot(page: {
  url: () => string;
  title: () => Promise<string>;
  evaluate: (fn: () => unknown) => Promise<unknown>;
}) {
  const title = await page.title().catch(() => '');
  const content = (await page
    .evaluate(() => {
      const doc = window.document.cloneNode(true) as Document;
      doc.querySelectorAll('script, style, nav, footer, iframe').forEach((el) => el.remove());
      return (doc.body?.innerText ?? '').slice(0, 2000);
    })
    .catch(() => '')) as string;
  const interactables = await readInteractables(page as never);
  const authBarrier = await detectPageAuthBarrier(page as never);
  return {
    url: page.url(),
    title,
    content,
    interactables,
    authBarrier,
  };
}

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
          const stored = await readStoredBrowserState(ctx.userId).catch(() => null);
          const page = await startSandboxBrowser(sandbox, {
            storageState: stored?.storageState,
          });
          await page.goto(checked.url.toString(), { waitUntil: 'domcontentloaded', timeout: 25000 });
          if (/bilimclass\.kz/i.test(checked.url.hostname)) {
            await page.waitForTimeout(1500);
          }
          const snap = await extractPageSnapshot(page as never);
          const st = await getSandboxBrowserState(sandbox);
          await persistSandboxBrowserState(ctx.userId, st.storageState, st.currentUrl).catch(() => {});
          return {
            success: true,
            ...snap,
          };
        } catch (sbErr) {
          const errMsg = sbErr instanceof Error ? sbErr.message : String(sbErr);
          return { success: false, error: `Ошибка браузера Sandbox: ${errMsg}` };
        }
      }

      // Фоллбэк: Cloudflare Browser Run (только для локальной разработки без Sandbox).
      const session = await getAgentBrowserSession(ctx.userId);
      await installRequestGuard(session.page);
      await session.page.goto(checked.url.toString(), { waitUntil: 'domcontentloaded', timeout: 25000 });
      if (/bilimclass\.kz/i.test(checked.url.hostname)) {
        await session.page.waitForTimeout(1500);
      }
      await persistAgentBrowserSession(ctx.userId);
      const snap = await extractPageSnapshot(session.page as never);
      return { success: true, ...snap };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'navigation failed' };
    }
  },

  browserClick: async (
    { x, y, intent }: { x: number; y: number; intent?: string },
    ctx?: { userId?: string },
  ) => {
    if (!ctx?.userId || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
      return { success: false, error: 'Нужны нормализованные координаты x и y (0–999) из списка interactables' };
    }
    const px = denormalize(Number(x), SCREEN_WIDTH);
    const py = denormalize(Number(y), SCREEN_HEIGHT);

    try {
      const sandbox = await getVercelSandbox(ctx.userId).catch(() => null) as BrowserSandbox | null;
      if (sandbox) {
        const stored = await readStoredBrowserState(ctx.userId).catch(() => null);
        const page = await startSandboxBrowser(sandbox, {
          storageState: stored?.storageState,
          currentUrl: stored?.currentUrl,
        });
        const probe = await probeElement(page as never, px, py);
        const decision = classifyClick(probe.label);
        if (decision.requiresConfirmation) {
          const desc = `${intent ? `${intent} — ` : ''}нажать «${probe.label || `(${x}, ${y})`}» (${decision.reason})`;
          const allowed = await requestPermission(ctx.userId, desc, 'high');
          if (!allowed) {
            return {
              success: false,
              denied: true,
              error: `Учитель отклонил действие: «${probe.label || intent || 'клик'}». Не повторяй его.`,
            };
          }
        }
        await page.mouse.click(px, py);
        await page.waitForTimeout(1500);
        const snap = await extractPageSnapshot(page as never);
        const st = await getSandboxBrowserState(sandbox);
        await persistSandboxBrowserState(ctx.userId, st.storageState, st.currentUrl).catch(() => {});
        return {
          success: true,
          clicked: probe.label || `(${px}, ${py})`,
          ...snap,
        };
      }

      const session = await getAgentBrowserSession(ctx.userId);
      const probe = await probeElement(session.page as never, px, py);
      const decision = classifyClick(probe.label);
      if (decision.requiresConfirmation) {
        const desc = `${intent ? `${intent} — ` : ''}нажать «${probe.label || `(${x}, ${y})`}» (${decision.reason})`;
        const allowed = await requestPermission(ctx.userId, desc, 'high');
        if (!allowed) {
          return {
            success: false,
            denied: true,
            error: `Учитель отклонил действие: «${probe.label || intent || 'клик'}». Не повторяй его.`,
          };
        }
      }
      await session.page.mouse.click(px, py);
      await session.page.waitForTimeout(1500);
      await persistAgentBrowserSession(ctx.userId);
      const snap = await extractPageSnapshot(session.page as never);
      return {
        success: true,
        clicked: probe.label || `(${px}, ${py})`,
        ...snap,
      };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'click failed' };
    }
  },

  browserType: async (
    { x, y, text, pressEnter }: { x?: number; y?: number; text: string; pressEnter?: boolean },
    ctx?: { userId?: string },
  ) => {
    if (!ctx?.userId || typeof text !== 'string' || !text.trim()) {
      return { success: false, error: 'Нужен непустой текст для ввода' };
    }
    const hasCoords = Number.isFinite(Number(x)) && Number.isFinite(Number(y));
    const px = hasCoords ? denormalize(Number(x), SCREEN_WIDTH) : null;
    const py = hasCoords ? denormalize(Number(y), SCREEN_HEIGHT) : null;

    try {
      const sandbox = await getVercelSandbox(ctx.userId).catch(() => null) as BrowserSandbox | null;
      if (sandbox) {
        const stored = await readStoredBrowserState(ctx.userId).catch(() => null);
        const page = await startSandboxBrowser(sandbox, {
          storageState: stored?.storageState,
          currentUrl: stored?.currentUrl,
        });
        let fieldLabel = '';
        if (px !== null && py !== null) {
          const probe = await probeElement(page as never, px, py);
          fieldLabel = probe.label;
          if (probe.type === 'password') {
            return {
              success: false,
              error: 'Поле пароля заполняет только сам учитель вручную во вкладке «Браузер». Передай управление учителю.',
            };
          }
        }
        const isEdu = /bilimclass\.kz|kundelik\.kz|nobd/i.test(page.url());
        const decision = classifyTyping(text, fieldLabel, isEdu);
        if (decision.requiresConfirmation) {
          const desc = `ввести текст «${text.slice(0, 60)}» в поле «${fieldLabel || 'на странице'}» (${decision.reason})`;
          const allowed = await requestPermission(ctx.userId, desc, 'high');
          if (!allowed) {
            return {
              success: false,
              denied: true,
              error: `Учитель отклонил ввод текста: «${text.slice(0, 40)}». Не повторяй его.`,
            };
          }
        }
        if (px !== null && py !== null) {
          await page.mouse.click(px, py);
        }
        await page.keyboard.type(text);
        if (pressEnter) await page.keyboard.press('Enter');
        await page.waitForTimeout(1000);
        const snap = await extractPageSnapshot(page as never);
        const st = await getSandboxBrowserState(sandbox);
        await persistSandboxBrowserState(ctx.userId, st.storageState, st.currentUrl).catch(() => {});
        return {
          success: true,
          typed: text.slice(0, 80),
          ...snap,
        };
      }

      const session = await getAgentBrowserSession(ctx.userId);
      let fieldLabel = '';
      if (px !== null && py !== null) {
        const probe = await probeElement(session.page as never, px, py);
        fieldLabel = probe.label;
        if (probe.type === 'password') {
          return {
            success: false,
            error: 'Поле пароля заполняет только сам учитель вручную во вкладке «Браузер».',
          };
        }
      }
      const isEdu = /bilimclass\.kz|kundelik\.kz|nobd/i.test(session.page.url());
      const decision = classifyTyping(text, fieldLabel, isEdu);
      if (decision.requiresConfirmation) {
        const desc = `ввести текст «${text.slice(0, 60)}» в поле «${fieldLabel || 'на странице'}» (${decision.reason})`;
        const allowed = await requestPermission(ctx.userId, desc, 'high');
        if (!allowed) {
          return {
            success: false,
            denied: true,
            error: `Учитель отклонил ввод текста: «${text.slice(0, 40)}». Не повторяй его.`,
          };
        }
      }
      if (px !== null && py !== null) {
        await session.page.mouse.click(px, py);
      }
      await session.page.keyboard.type(text);
      if (pressEnter) await session.page.keyboard.press('Enter');
      await session.page.waitForTimeout(1000);
      await persistAgentBrowserSession(ctx.userId);
      const snap = await extractPageSnapshot(session.page as never);
      return {
        success: true,
        typed: text.slice(0, 80),
        ...snap,
      };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'type failed' };
    }
  },
};

