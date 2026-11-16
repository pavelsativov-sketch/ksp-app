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
  normalize,
  probeElement,
  readInteractables,
} from '../computer/screen';
import { classifyClick, classifyTyping } from '../computer/safety';
import { requestPermission } from '../permissions';
import { detectPageAuthBarrier } from '../browser-dom';
import { knownLoginSite, loginWithSavedCredentials, looksLoggedOut } from '../browser-autologin';
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
  // Четыре чтения страницы независимы: параллельно это одна секунда вместо четырёх
  // (каждый запрос к песочнице стоит ~0,9 с).
  const titlePromise = page.title().catch(() => '');
  const interactablesPromise = readInteractables(page as never);
  const authBarrierPromise = detectPageAuthBarrier(page as never);
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
        // Боковое меню занимает весь лимит текста, и содержимое страницы (расписание,
        // журнал) в ответ не попадает: агент принимал вошедшего учителя за гостя.
        if (el.getAttribute('role') === 'navigation' || /sidebar|side-menu|navbar/i.test(String(el.className))) return;
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
  const interactables = await interactablesPromise;
  // runner.ts по этому флагу переводит управление учителю и просит
  // авторизоваться — без него агент застревал бы на странице входа.
  const authBarrier = await authBarrierPromise;
  return {
    url: page.url(),
    title: await titlePromise,
    content,
    interactables,
    authBarrier,
  };
}

/** SPA BilimClass показывает индикатор загрузки, пока не ответит API: ждём до ~12 с, а не читаем пустой экран. */
const READY_MAX_MS = 10_000;

/**
 * Ожидание идёт внутри страницы одной командой. Раньше каждый опрос был отдельным
 * запросом к песочнице (~1 с туда-обратно плюс секунда паузы), и открытие
 * страницы занимало 15–20 с даже на прогретом браузере.
 */
const READY_SCRIPT = `(async () => {
  const deadline = Date.now() + ${READY_MAX_MS};
  let previous = -1;
  let stable = 0;
  while (Date.now() < deadline) {
    const loading = !!document.querySelector('.v-loading-screen.is-loading');
    const size = (document.body?.innerText ?? '').trim().length;
    // Готово, когда индикатора нет, текст есть и не меняется два замера подряд.
    stable = !loading && size > 0 && Math.abs(size - previous) <= 2 ? stable + 1 : 0;
    if (stable >= 2) return true;
    previous = size;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
})`;

type BrowserPage = Parameters<typeof extractPageSnapshot>[0] & {
  waitForTimeout(ms: number): Promise<void>;
  goto(url: string, options: { waitUntil: 'domcontentloaded'; timeout: number }): Promise<unknown>;
};

async function waitForBilimReady(page: BrowserPage) {
  await (page.evaluate as unknown as (script: string) => Promise<unknown>)(READY_SCRIPT).catch(() => undefined);
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
 * Снимок после перехода: если сайт показал гостевую страницу вместо кабинета,
 * система сама идёт на страницу входа, входит и возвращается на нужный адрес.
 * Иначе агент видел кнопку «Кіру» и просил учителя войти, хотя данные сохранены.
 */
async function snapshotAfterNavigation(userId: string, page: BrowserPage) {
  const first = await snapshotWithAutoLogin(userId, page);
  if (!knownLoginSite(first.url)) return first;
  if (first.authBarrier?.requiresUserAction) return first;
  // Модель принимала кабинет с пустым разделом за гостевую страницу: состояние входа определяем сами.
  if (!looksLoggedOut(first.content)) return { ...first, signedIn: true };

  const target = first.url;
  await page.goto(`${new URL(target).origin}/login`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await waitForBilimReady(page);
  const atLogin = await snapshotWithAutoLogin(userId, page);
  if (!('autoLogin' in atLogin)) return atLogin; // нет данных или сайт их не принял: это покажет окно входа

  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await waitForBilimReady(page);
  await persistAgentBrowserSession(userId);
  return { ...(await extractPageSnapshot(page)), autoLogin: atLogin.autoLogin, signedIn: true };
}

const pendingPersists = new Map<string, Promise<void>>();

/**
 * Сохранение сессии в фоне. Запись в базу занимала ~5 с из каждого открытия
 * страницы и клика, а агенту для следующего шага она не нужна. Сохранения одного
 * пользователя идут по очереди; задача дожидается их через flushBrowserPersist.
 */
function persistInBackground(userId: string): void {
  const previous = pendingPersists.get(userId) ?? Promise.resolve();
  const next = previous.then(() => persistAgentBrowserSession(userId)).then(() => undefined, () => undefined);
  pendingPersists.set(userId, next);
}

/** Дождаться фоновых сохранений сессии: без этого функция могла бы завершиться раньше записи. */
export async function flushBrowserPersist(userId: string): Promise<void> {
  await pendingPersists.get(userId);
}

/** Клик по нормализованным координатам с проверкой опасных кнопок; общий для browserClick и browserClickText. */
async function clickAt(
  { x, y, intent }: { x: number; y: number; intent?: string },
  ctx?: { userId?: string },
) {
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
    persistInBackground(ctx.userId);
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
}

/**
 * Скрипт страницы: самый маленький видимый элемент, чья подпись равна тексту
 * (или начинается с него), прокручивается в центр; возвращает его центр в пикселях.
 */
export function findByTextScript(text: string | string[]): string {
  const wants = (Array.isArray(text) ? text : [text]).map((item) => item.toLowerCase());
  return `(() => {
    const wants = ${JSON.stringify(wants)};
    const norm = (s) => String(s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const visible = [];
    for (const el of document.querySelectorAll('body *')) {
      const label = norm(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title'));
      if (!label || label.length > 90) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
      visible.push({ el, label, area: rect.width * rect.height });
    }
    // Подписи идут по приоритету: первая найденная на экране и нажимается.
    for (const want of wants) {
      let best = null;
      for (const item of visible) {
        if (item.label !== want && !(item.label.startsWith(want) && item.label.length <= want.length + 3)) continue;
        if (!best || item.area < best.area) best = item;
      }
      if (!best) continue;
      best.el.scrollIntoView({ block: 'center', inline: 'center' });
      const rect = best.el.getBoundingClientRect();
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2), text: want };
    }
    return null;
  })`;
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
      // Разбивка по этапам уходит в результат: по ней видно, где теряются секунды.
      const timing: Record<string, number | boolean> = {};
      const startedAt = Date.now();
      const snap = await withBrowserSession(userId, async (session) => {
        timing.sessionMs = Date.now() - startedAt;
        await installRequestGuard(session.page);
        const gotoStartedAt = Date.now();
        try {
          await session.page.goto(checked.url.toString(), { waitUntil: 'domcontentloaded', timeout: 25000 });
        } catch (error) {
          timing.gotoRetried = true;
          // A single retry tolerates a transient load timeout without turning a
          // permanently slow site into an endless agent loop.
          if (!navigationTimedOut(error)) throw error;
          await session.page.goto(checked.url.toString(), { waitUntil: 'domcontentloaded', timeout: 25000 });
        }
        timing.gotoMs = Date.now() - gotoStartedAt;
        const readyStartedAt = Date.now();
        if (/bilimclass\.kz/i.test(checked.url.hostname)) {
          await waitForBilimReady(session.page as never);
        }
        timing.readyMs = Date.now() - readyStartedAt;
        // Сохранение сессии и снимок страницы друг от друга не зависят.
        persistInBackground(userId);
        return snapshotAfterNavigation(userId, session.page as never);
      });
      timing.totalMs = Date.now() - startedAt;
      return boundedResult({ success: true, timing, ...snap });
    } catch (e) {
      return boundedResult({ success: false, error: e instanceof Error ? e.message : 'navigation failed' });
    }
  },

  browserClick: clickAt,

  /**
   * Клик по видимой подписи. Переключатели из div без роли (язык BilimClass)
   * не попадают в interactables, и модель гадала координаты.
   */
  browserClickText: async ({ text, texts, intent }: { text?: string; texts?: string[]; intent?: string }, ctx?: { userId?: string }) => {
    // texts — несколько подписей по приоритету одним запросом к браузеру (рецепты).
    const list = (Array.isArray(texts) ? texts : [text]).map((item) => (typeof item === 'string' ? item.replace(/\s+/g, ' ').trim() : '')).filter((item) => item && item.length <= 80).slice(0, 6);
    const wanted = list.join(' / ');
    if (!ctx?.userId || !list.length) {
      return { success: false, error: 'Нужен text — видимая подпись элемента, до 80 символов' };
    }
    try {
      const session = await getAgentBrowserSession(ctx.userId);
      const found = await session.page.evaluate<{ x: number; y: number; text: string } | null>(findByTextScript(list));
      if (!found) {
        return { success: false, error: `На экране нет элемента с текстом «${wanted}». Прокрути страницу или открой меню, где он может быть.` };
      }
      return clickAt({ x: normalize(found.x, SCREEN_WIDTH), y: normalize(found.y, SCREEN_HEIGHT), intent: intent ?? wanted }, ctx);
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
      const base64 = Buffer.from(shot).toString('base64'); // RPC отдаёт Uint8Array: у него toString('base64') даёт «255,216,…»
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
