import {
  getAgentBrowserSession,
  persistAgentBrowserSession,
  withBrowserSession,
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
import { knownLoginSite, loginWithSavedCredentials } from '../browser-autologin';
import { executeWithFallback } from '@/lib/ai/providers';
import { boundedResult } from './bounded-result';

/** Один «экран» прокрутки в пикселях (высота окна браузера 800, небольшой нахлёст). */
const SCREEN_STEP_PX = 700;

/** Разрешённые служебные клавиши: регистронезависимо → каноническое имя Playwright. */
export const ALLOWED_KEYS = new Map<string, string>([
  ['escape', 'Escape'], ['esc', 'Escape'], ['tab', 'Tab'],
  ['arrowup', 'ArrowUp'], ['arrowdown', 'ArrowDown'], ['arrowleft', 'ArrowLeft'], ['arrowright', 'ArrowRight'],
  ['pageup', 'PageUp'], ['pagedown', 'PageDown'], ['home', 'Home'], ['end', 'End'],
]);

function navigationTimedOut(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /navigation timeout|timeout .* exceeded|timed out.*navigat/i.test(message);
}

async function extractPageSnapshot(page: {
  url: () => string;
  title: () => Promise<string>;
  evaluate: (fn: () => unknown) => Promise<unknown>;
}) {
  const title = await page.title().catch(() => '');
  const content = (await page
    .evaluate(() => {
      // Обходим живой документ и берём только видимые текстовые узлы. Раньше
      // текст брался из клона документа: у отсоединённого DOM нет вёрстки, и
      // содержимое <noscript> попадало в ответ сырой HTML-разметкой.
      const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'NAV', 'FOOTER', 'IFRAME', 'SVG', 'HEAD']);
      const lines: string[] = [];
      let size = 0;
      const walk = (el: Element) => {
        if (size > 2000 || skip.has(el.tagName.toUpperCase())) return;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return;
        el.childNodes.forEach((node) => {
          if (size > 2000) return;
          if (node.nodeType === 3) {
            const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
            if (text) { lines.push(text); size += text.length + 1; }
          } else if (node.nodeType === 1) {
            walk(node as Element);
          }
        });
      };
      if (document.body) walk(document.body);
      return lines.join('\n').slice(0, 2000);
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

/** SPA BilimClass показывает индикатор загрузки, пока не ответит API: ждём до ~12 с, а не читаем пустой экран. */
async function waitForBilimReady(page: Parameters<typeof extractPageSnapshot>[0] & { waitForTimeout(ms: number): Promise<void> }) {
  for (let i = 0; i < 12; i += 1) {
    const loading = await page
      .evaluate(() => !!document.querySelector('.v-loading-screen.is-loading') || (document.body?.innerText ?? '').trim().length === 0)
      .catch(() => false);
    if (!loading) return;
    await page.waitForTimeout(1000);
  }
}

/**
 * Снимок страницы с автовходом: если открыта форма входа известного сайта
 * (BilimClass), а учитель уже сохранил данные, вход выполняется сам, без
 * участия модели. Если данных нет, в ответ идёт `needsCredentials`: интерфейс
 * покажет окно ввода логина и пароля.
 */
async function snapshotWithAutoLogin(userId: string, page: Parameters<typeof extractPageSnapshot>[0]) {
  const snap = await extractPageSnapshot(page);
  if (snap.authBarrier?.kind !== 'login') return snap;
  const site = knownLoginSite(snap.url);
  if (!site) return snap;

  const result = await loginWithSavedCredentials(userId, page as never);
  if (result.status === 'logged-in') {
    await persistAgentBrowserSession(userId).catch(() => undefined);
    return { ...(await extractPageSnapshot(page)), autoLogin: `Вход в ${site.name} выполнен сохранёнными данными учителя` };
  }
  const reasons: Partial<Record<typeof result.status, string>> = {
    'no-credentials': `Для входа в ${site.name} нужны логин и пароль: учитель вводит их в открывшемся окне, после этого вход выполнится автоматически. Не пытайся вводить их сам.`,
    rejected: `${site.name} не принял сохранённые данные. Учителю нужно ввести актуальные логин и пароль в окне входа.`,
    throttled: `Повторная попытка входа в ${site.name} возможна через минуту; не повторяй вход, дождись учителя.`,
  };
  const reason = reasons[result.status];
  if (!reason) return snap;
  return {
    ...snap,
    needsCredentials: { domain: site.domain, name: site.name, reason: result.status },
    authBarrier: { ...snap.authBarrier, reason },
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

      const userId = ctx.userId;
      const snap = await withBrowserSession(userId, async (session) => {
        await installRequestGuard(session.page);
        try {
          await session.page.goto(checked.url.toString(), { waitUntil: 'domcontentloaded', timeout: 25000 });
        } catch (error) {
          // A single retry tolerates a transient load timeout without turning a
          // permanently slow site into an endless agent loop.
          if (!navigationTimedOut(error)) throw error;
          await session.page.goto(checked.url.toString(), { waitUntil: 'domcontentloaded', timeout: 25000 });
        }
        if (/bilimclass\.kz/i.test(checked.url.hostname)) {
          await waitForBilimReady(session.page);
        }
        await persistAgentBrowserSession(userId);
        return snapshotWithAutoLogin(ctx.userId!, session.page);
      });
      return boundedResult({ success: true, ...snap });
    } catch (e) {
      return boundedResult({ success: false, error: e instanceof Error ? e.message : 'navigation failed' });
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
      const beforeUrl = session.page.url();
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
      const snap = await snapshotWithAutoLogin(ctx.userId, session.page);
      const pageUnchanged = beforeUrl === snap.url;
      return boundedResult({
        success: true,
        clicked: probe.label || `(${px}, ${py})`,
        pageUnchanged,
        ...(pageUnchanged ? { notice: 'адрес страницы не изменился; на одностраничных сайтах содержимое могло обновиться — сверь content и interactables' } : {}),
        ...snap,
      });
    } catch (e) {
      return boundedResult({ success: false, error: e instanceof Error ? e.message : 'click failed' });
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
      return boundedResult({
        success: true,
        typed: text.slice(0, 80),
        ...snap,
      });
    } catch (e) {
      return boundedResult({ success: false, error: e instanceof Error ? e.message : 'type failed' });
    }
  },

  /**
   * Прокрутка страницы. Без неё агент видел только первый экран: журналы,
   * таблицы оценок и длинные списки BilimClass оставались недоступными.
   */
  browserScroll: async (
    { direction, amount }: { direction?: string; amount?: number },
    ctx?: { userId?: string },
  ) => {
    if (!ctx?.userId) return { success: false, error: 'Нужна пользовательская сессия' };
    const dir = direction === 'up' || direction === 'left' || direction === 'right' ? direction : 'down';
    // amount — число «экранов» (по умолчанию один), не больше пяти за вызов.
    const screens = Math.min(Math.max(Number(amount) || 1, 0.25), 5);
    const delta = Math.round(screens * SCREEN_STEP_PX);
    try {
      const snap = await withBrowserSession(ctx.userId, async (session) => {
        const dx = dir === 'left' ? -delta : dir === 'right' ? delta : 0;
        const dy = dir === 'up' ? -delta : dir === 'down' ? delta : 0;
        await session.page.mouse.wheel(dx, dy);
        await session.page.waitForTimeout(700);
        return extractPageSnapshot(session.page);
      });
      return boundedResult({ success: true, scrolled: `${dir} ${screens}`, ...snap });
    } catch (e) {
      return boundedResult({ success: false, error: e instanceof Error ? e.message : 'scroll failed' });
    }
  },

  /**
   * Служебные клавиши без риска отправки формы: закрыть окно (Escape),
   * перейти по полям (Tab), стрелки, постраничная прокрутка. Enter сюда не
   * входит: подтверждение форм идёт через browserType с проверкой политики.
   */
  browserPressKey: async ({ key }: { key?: string }, ctx?: { userId?: string }) => {
    if (!ctx?.userId) return { success: false, error: 'Нужна пользовательская сессия' };
    const allowed = ALLOWED_KEYS.get(String(key ?? '').toLowerCase());
    if (!allowed) {
      return { success: false, error: `Клавиша не разрешена. Доступны: ${[...new Set(ALLOWED_KEYS.values())].join(', ')}. Для Enter используй browserType с pressEnter.` };
    }
    try {
      const snap = await withBrowserSession(ctx.userId, async (session) => {
        await session.page.keyboard.press(allowed);
        await session.page.waitForTimeout(500);
        return extractPageSnapshot(session.page);
      });
      return boundedResult({ success: true, pressed: allowed, ...snap });
    } catch (e) {
      return boundedResult({ success: false, error: e instanceof Error ? e.message : 'key failed' });
    }
  },

  /** Назад по истории браузера. */
  browserGoBack: async (_args: Record<string, never>, ctx?: { userId?: string }) => {
    if (!ctx?.userId) return { success: false, error: 'Нужна пользовательская сессия' };
    try {
      const snap = await withBrowserSession(ctx.userId, async (session) => {
        await session.page.goBack({ timeout: 15000 });
        await session.page.waitForTimeout(800);
        await persistAgentBrowserSession(ctx.userId!);
        return snapshotWithAutoLogin(ctx.userId!, session.page);
      });
      return boundedResult({ success: true, ...snap });
    } catch (e) {
      return boundedResult({ success: false, error: e instanceof Error ? e.message : 'back failed' });
    }
  },

  /** Подождать загрузку: журналы BilimClass подгружают таблицу не сразу. */
  browserWait: async ({ seconds }: { seconds?: number }, ctx?: { userId?: string }) => {
    if (!ctx?.userId) return { success: false, error: 'Нужна пользовательская сессия' };
    const ms = Math.round(Math.min(Math.max(Number(seconds) || 2, 1), 10) * 1000);
    try {
      const snap = await withBrowserSession(ctx.userId, async (session) => {
        await session.page.waitForTimeout(ms);
        return snapshotWithAutoLogin(ctx.userId!, session.page);
      });
      return boundedResult({ success: true, waited: ms / 1000, ...snap });
    } catch (e) {
      return boundedResult({ success: false, error: e instanceof Error ? e.message : 'wait failed' });
    }
  },

  /**
   * «Зрение» задачного агента: снимок текущей страницы → текстовое описание
   * через vision-модель. Позволяет понять визуальное состояние (графики,
   * ошибки, элементы вне innerText), не меняя страницу.
   */
  browserDescribeScreen: async (args: Record<string, never>, ctx?: { userId?: string }) => {
    if (!ctx?.userId) return { success: false, error: 'Нужна пользовательская сессия' };
    try {
      const session = await getAgentBrowserSession(ctx.userId);
      const shot = await session.page.screenshot({ type: 'jpeg', quality: 70 });
      const base64 = shot.toString('base64');
      const description = await executeWithFallback('vision', async (client, model) => {
        const resp = await client.chat.completions.create({
          model,
          max_completion_tokens: 800,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Опиши подробно, что показано на экране: заголовки, поля, кнопки, ошибки, графики и их состояние. Это нужно агенту, который работает от лица учителя, для продолжения задачи.',
                },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
              ],
            },
          ],
        });
        return resp.choices[0]?.message?.content ?? '';
      });
      return boundedResult({
        success: true,
        url: session.page.url(),
        description: String(description).trim().slice(0, 3000),
      });
    } catch (e) {
      return boundedResult({ success: false, error: e instanceof Error ? e.message : 'vision failed' });
    }
  },
};
