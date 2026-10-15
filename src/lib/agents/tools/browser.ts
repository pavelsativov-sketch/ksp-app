import {
  getAgentBrowserSession,
  persistAgentBrowserSession,
} from '../browser-session';
import { checkPublicUrl, installRequestGuard } from '../ssrf';
import {
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  denormalize,
  probeElement,
  readInteractables,
} from '../computer/screen';
import { classifyClick, classifyTyping } from '../computer/safety';
import { requestPermission } from '../permissions';
import { detectPageAuthBarrier } from '../browser-dom';

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
  // runner.ts по этому флагу переводит управление учителю и просит
  // авторизоваться — без него агент застревал бы на странице входа.
  const authBarrier = await detectPageAuthBarrier(page as never);
  return {
    url: page.url(),
    title,
    content,
    interactables,
    authBarrier,
  };
}

/**
 * Инструменты браузера агента.
 *
 * Все три работают через `getAgentBrowserSession` — ту же сессию, которую
 * показывает учителю вкладка «Браузер» рабочей области ОС. Раньше здесь
 * сначала поднимался Chromium в Vercel Sandbox, и агент работал в браузере,
 * которого никто не видел: его клики не появлялись на экране, а ручной ввод
 * учителя был ему недоступен.
 */
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
      await session.page.goto(checked.url.toString(), { waitUntil: 'domcontentloaded', timeout: 25000 });
      if (/bilimclass\.kz/i.test(checked.url.hostname)) {
        await session.page.waitForTimeout(1500);
      }
      await persistAgentBrowserSession(ctx.userId);
      const snap = await extractPageSnapshot(session.page);
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
      const snap = await extractPageSnapshot(session.page);
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
      const snap = await extractPageSnapshot(session.page);
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