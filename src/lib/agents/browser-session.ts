import type { Browser, BrowserContext, Page } from "playwright";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getDb, COL } from "@/lib/mongo";
import { browserRpc, BrowserRpcError, createBrowserRpcSession } from "@/lib/agents/browser-rpc";
import { log } from "@/lib/logger";
import { getBrowserTarget } from "@/lib/agents/runtime-mode";
export { browserFailure } from "@/lib/agents/browser-failure";

export interface AgentBrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  lastSeen: number;
  remote?: RemoteBrowserSession;
}

export interface RemoteBrowserSession {
  validate: () => Promise<boolean>;
  sessionId: string;
  /** Когда последний раз реально проверяли живость сессии (см. VALIDATE_INTERVAL_MS). */
  lastValidatedAt: number;
  getInteractionState: () => unknown;
  performUiAction: (action: string, args?: Record<string, unknown>, allowedOrigin?: string) => Promise<{ screenshot: Uint8Array; title: string; currentUrl: string }>;
}

const SESSION_TTL_MS = 5 * 60_000;
const sessions = new Map<string, AgentBrowserSession>();
const opening = new Map<string, Promise<AgentBrowserSession>>();

function storageKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET должен содержать минимум 32 символа для шифрования сессии браузера");
  return createHash("sha256").update(`mekty-browser-session:${secret}`).digest();
}

function encryptState(state: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", storageKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(state, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

function decryptState(encoded: string): string | null {
  try {
    const [version, ivPart, tagPart, bodyPart] = encoded.split(".");
    if (version !== "v1" || !ivPart || !tagPart || !bodyPart) return null;
    const decipher = createDecipheriv("aes-256-gcm", storageKey(), Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(bodyPart, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

type SavedBrowserState = {
  storageState?: Awaited<ReturnType<BrowserContext["storageState"]>>;
  currentUrl?: string;
  sessionId?: string;
  interactionState?: unknown;
};

/**
 * Сохранённое состояние браузера пользователя: куки/localStorage, текущий
 * адрес и id сессии в песочнице. Именно его читает createAgentBrowserSession,
 * чтобы не открывать новую сессию браузера после перезапуска процесса.
 */
export async function readStoredBrowserState(userId: string): Promise<SavedBrowserState | undefined> {
  return readStoredState(userId);
}

async function readStoredState(userId: string): Promise<SavedBrowserState | undefined> {
  const db = await getDb();
  const doc = await db.collection(COL.agentBrowserSessions).findOne({ user_id: userId }, { projection: { encrypted_state: 1 } });
  if (typeof doc?.encrypted_state !== "string") return undefined;
  const decoded = decryptState(doc.encrypted_state);
  if (!decoded) return undefined;
  try {
    const value = JSON.parse(decoded) as Record<string, unknown>;
    // Old documents contain Playwright StorageState directly.
    if (Array.isArray(value.cookies)) return { storageState: value as SavedBrowserState["storageState"] };
    const currentUrl = typeof value.currentUrl === "string" ? value.currentUrl : undefined;
    const sessionId = typeof value.sessionId === "string" ? value.sessionId : undefined;
    // Сессия в песочнице восстанавливается по sessionId даже без storageState,
    // поэтому отсутствие кук не должно обнулять весь документ — иначе после
    // каждой перезагрузки лямбды открывается новая сессия браузера.
    if (!currentUrl && !sessionId && !value.storageState) return undefined;
    return {
      storageState: value.storageState && typeof value.storageState === "object"
        ? value.storageState as SavedBrowserState["storageState"]
        : undefined,
      currentUrl,
      sessionId,
      interactionState: value.interactionState,
    };
  } catch {
    return undefined;
  }
}

export async function persistAgentBrowserSession(userId: string): Promise<void> {
  const session = sessions.get(userId);
  if (!session || session.page.isClosed()) return;
  const state = await session.context.storageState({ indexedDB: true }).catch(() => undefined);
  const currentUrl = /^https?:\/\//i.test(session.page.url()) ? session.page.url() : undefined;
  const sessionId = session.remote?.sessionId;

  // У remote-сессии storageState приезжает только по явному запросу, и если
  // runner не смог его собрать — приходит пустым. Затирать им сохранённые
  // куки нельзя: иначе после рестарта лямбды вход в BilimClass теряется.
  const prev = await readStoredState(userId).catch(() => undefined);
  const merged = state ? mergeStorageStates(prev?.storageState, state) : prev?.storageState;

  const db = await getDb();
  await db.collection(COL.agentBrowserSessions).updateOne(
    { user_id: userId },
    { $set: { encrypted_state: encryptState(JSON.stringify({ storageState: merged, currentUrl: currentUrl ?? prev?.currentUrl, sessionId: sessionId ?? prev?.sessionId, interactionState: session.remote?.getInteractionState?.() ?? prev?.interactionState })), updated_at: new Date() }, $setOnInsert: { created_at: new Date() } },
    { upsert: true },
  );
}

export async function clearAgentBrowserSession(userId: string): Promise<void> {
  const session = sessions.get(userId);
  sessions.delete(userId);
  if (session) {
    await session.context.close().catch(() => {});
    await session.browser.close().catch(() => {});
  } else if (getBrowserTarget() !== "none") {
    const stored = await readStoredState(userId).catch(() => undefined);
    if (stored?.sessionId) {
      // Адрес раннера выбирает resolveRunnerUrl: персональная Vercel Sandbox.
      await browserRpc(userId, "close", { sessionId: stored.sessionId }).catch(() => {});
    }
  }
  const db = await getDb();
  await db.collection(COL.agentBrowserSessions).deleteOne({ user_id: userId });
}

type PlaywrightStorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

function mergeStorageStates(
  prev: PlaywrightStorageState | undefined,
  next: PlaywrightStorageState,
): PlaywrightStorageState {
  if (!prev) return next;
  const cookieMap = new Map<string, PlaywrightStorageState["cookies"][number]>();
  for (const c of prev.cookies ?? []) {
    cookieMap.set(`${c.name}|${c.domain}|${c.path}`, c);
  }
  for (const c of next.cookies ?? []) {
    cookieMap.set(`${c.name}|${c.domain}|${c.path}`, c);
  }
  const originMap = new Map<string, PlaywrightStorageState["origins"][number]>();
  for (const o of prev.origins ?? []) {
    originMap.set(o.origin, o);
  }
  for (const o of next.origins ?? []) {
    originMap.set(o.origin, o);
  }
  return {
    cookies: Array.from(cookieMap.values()),
    origins: Array.from(originMap.values()),
  };
}

function reapSessions(now = Date.now()): void {
  for (const [userId, session] of sessions) {
    if (now - session.lastSeen < SESSION_TTL_MS) continue;
    sessions.delete(userId);
    void session.context.close().catch(() => {});
    void session.browser.close().catch(() => {});
  }
}

/**
 * Как недавно проверять, что сессия в песочнице жива.
 *
 * Раньше validate() дёргал раннер на КАЖДЫЙ запрос, включая ввод каждой
 * буквы пароля: один символ стоил лишнего круговогоtrip'а к удалённой
 * песочнице — при проклавиатуре это и было причиной «тупит». Теперь проверка
 * идёт не чаще раза в VALIDATE_INTERVAL_MS; если сессия всё-таки протухла,
 * действие вернёт 410, и вкладка переподключится.
 */
const VALIDATE_INTERVAL_MS = 15_000;

/** Раннер сообщил, что сеанс браузера больше не существует (HTTP 410). */
export function isSessionGone(error: unknown): boolean {
  if (error instanceof BrowserRpcError) return error.status === 410;
  return error instanceof Error && /session expired or not found|сеанс браузера завершён/i.test(error.message);
}

/**
 * Выполняет действие в браузерной сессии, а если сеанс оказался мёртвым —
 * один раз повторяет его на свежей. Агент не должен тратить шаги на ошибку,
 * которую приложение может исправить само.
 */
export async function withBrowserSession<T>(
  userId: string,
  run: (session: AgentBrowserSession) => Promise<T>,
  getSession: (userId: string) => Promise<AgentBrowserSession> = getAgentBrowserSession,
): Promise<T> {
  try {
    return await run(await getSession(userId));
  } catch (error) {
    if (!isSessionGone(error)) throw error;
    return run(await getSession(userId));
  }
}

/** Один настоящий браузерный контекст на пользователя, общий для UI и агента. */
export async function getAgentBrowserSession(userId: string): Promise<AgentBrowserSession> {
  if (!userId || userId.length > 128) throw new Error("Invalid browser session owner");
  const now = Date.now();
  reapSessions(now);

  const current = sessions.get(userId);
  if (current && current.browser.isConnected() && !current.page.isClosed()) {
    const lastCheck = current.remote?.lastValidatedAt ?? 0;
    const recentlyChecked = now - lastCheck < VALIDATE_INTERVAL_MS;
    if (current.remote && !recentlyChecked && !await current.remote.validate()) {
      sessions.delete(userId);
    } else {
      if (current.remote) current.remote.lastValidatedAt = now;
      current.lastSeen = now;
      return current;
    }
  }

  const pending = opening.get(userId);
  if (pending) return pending;

  const create = createAgentBrowserSession(userId, now);
  opening.set(userId, create);
  try {
    return await create;
  } finally {
    if (opening.get(userId) === create) opening.delete(userId);
  }
}

async function createAgentBrowserSession(userId: string, now: number): Promise<AgentBrowserSession> {
  const current = sessions.get(userId);
  if (current) {
    sessions.delete(userId);
    await current.context.close().catch(() => {});
    await current.browser.close().catch(() => {});
  }

  const stored = await readStoredState(userId).catch(() => undefined);

  const browserTarget = getBrowserTarget();

  // Браузер рабочей области существует только в персональной Vercel Sandbox.
  // Раньше здесь была ветка «Chromium в процессе Node», чтобы ОС работала
  // при `npm run dev`: она создавала второй браузер с другим поведением
  // (другой SSRF-контур, без общего состояния с агентом) и только размывала
  // смысл единой сессии. Код раннера проверяется отдельно —
  // `node scripts/check-runner.mjs` и `tests/integration/os-browser-flow.test.ts`.
  if (browserTarget !== "vercel-sandbox") {
    throw new BrowserRpcError(
      "Браузер рабочей области доступен только на Vercel. Разверните приложение на Vercel.",
      503,
    );
  }

  try {
    const { getSandboxBrowserRpcUrl } = await import("@/lib/agents/sandbox-browser-service");
    const rpcUrl = await getSandboxBrowserRpcUrl(userId);
    if (stored?.sessionId) {
      const remote = createRemoteSession(userId, stored.sessionId, stored.currentUrl, stored.storageState, stored.interactionState, now, rpcUrl);
      if (await remote.remote!.validate()) return remote;
      sessions.delete(userId);
    }
    const created = await createBrowserRpcSession(userId, {
      storageState: stored?.storageState,
      currentUrl: stored?.currentUrl,
      rpcUrl,
    });
    return createRemoteSession(userId, created.sessionId!, stored?.currentUrl ?? created.currentUrl, stored?.storageState, stored?.interactionState, now, rpcUrl);
  } catch (e) {
    log.error("browser-session: Vercel Sandbox runner unavailable", { userId, error: String(e) });
    throw new BrowserRpcError(
      e instanceof Error ? e.message : "Облачный браузер временно недоступен. Попробуйте ещё раз.",
      503,
    );
  }
}

  function createRemoteSession(
  userId: string,
  sessionId: string,
  initialUrl: string | undefined,
  initialStorageState: unknown,
  initialInteractionState: unknown,
  now: number,
  rpcUrl?: string,
): AgentBrowserSession {
  let currentUrl = initialUrl ?? "about:blank";
  let currentStorageState = initialStorageState;
  let currentInteractionState = initialInteractionState;
  let closed = false;
  let closeRequest: Promise<void> | undefined;

  const send = async <T,>(action: string, args?: Record<string, unknown>, allowedOrigin?: string, captureScreenshot = false) => {
    if (closed && action !== "close") throw new BrowserRpcError("Browser session is closed", 410);
    let response: Awaited<ReturnType<typeof browserRpc<T>>>;
    try {
      response = await browserRpc<T>(userId, action, {
        sessionId,
        currentUrl,
        interactionState: currentInteractionState,
        rpcUrl,
        ...(allowedOrigin ? { allowedOrigin } : {}),
        ...(captureScreenshot ? { captureScreenshot: true } : {}),
        ...(args ? { args } : {}),
        timeoutMs: action === "navigate" ? 35_000 : 55_000,
      });
    } catch (error) {
      // 410 — раннер забыл сеанс (песочница уснула или перезапустилась). Раньше
      // мёртвая сессия оставалась в кэше, и все шаги агента падали одинаково,
      // пока не истекал интервал проверки. Теперь сбрасываем её сразу: следующий
      // запрос поднимет новую.
      if (isSessionGone(error) && action !== "close") {
        closed = true;
        if (sessions.get(userId)?.page === page) sessions.delete(userId);
      }
      throw error;
    }
    if (response.currentUrl) currentUrl = response.currentUrl;
    if ("storageState" in response && response.storageState !== undefined && response.storageState !== null) currentStorageState = response.storageState;
    if ("interactionState" in response && response.interactionState !== undefined) currentInteractionState = response.interactionState;
    return response;
  };

  const closeRemote = async () => {
    if (!closeRequest) {
      closed = true;
      closeRequest = browserRpc(userId, "close", { sessionId, rpcUrl }).then(() => undefined).catch(() => undefined);
    }
    await closeRequest;
  };

  const page = {
    isClosed: () => closed,
    url: () => currentUrl,
    title: async () => (await send<string>("title")).result ?? "",
    screenshot: async (opts: { type: "jpeg"; quality: number }) => (await send<Uint8Array>("screenshot", { quality: opts.quality })).result,
    goto: async (rawUrl: string, opts?: { waitUntil?: string; timeout?: number }) => {
      const target = new URL(rawUrl);
      if (target.protocol !== "http:" && target.protocol !== "https:") throw new BrowserRpcError("Разрешены только http и https", 400);
      const response = await send<{ url: string; status: number | null }>("navigate", { url: target.toString(), timeoutMs: opts?.timeout ?? 15_000 }, target.origin);
      return response.result ? { status: () => response.result.status } : null;
    },
    goBack: async (opts?: { timeout?: number }) => { await send("back", { timeoutMs: opts?.timeout }); return null; },
    goForward: async (opts?: { timeout?: number }) => { await send("forward", { timeoutMs: opts?.timeout }); return null; },
    reload: async (opts?: { timeout?: number }) => { await send("reload", { timeoutMs: opts?.timeout }); return null; },
    waitForTimeout: async (ms: number) => { await send("wait", { ms }); },
    evaluate: async <R, Arg = never>(fn: ((arg: Arg) => R | Promise<R>) | string, arg?: Arg): Promise<R> => {
      // Скрипт уходит строкой, аргумент — отдельным полем: без него
      // разведка элемента под точкой возвращала бы мусор.
      const script = typeof fn === "string" ? fn : fn.toString();
      return (await send<R>("evaluate", arg === undefined ? { script } : { script, arg })).result;
    },
    mouse: {
      click: async (x: number, y: number, opts?: { button?: string; clickCount?: number }) => {
        // button нужен Computer-Use: без него правый клик молча превращался в левый.
        await send("click", { x, y, button: opts?.button ?? "left", clickCount: opts?.clickCount });
      },
      move: async (x: number, y: number) => { await send("move", { x, y }); },
      wheel: async (dx: number, dy: number) => { await send("wheel", { dx, dy }); },
      down: async () => { await send("mouseDown"); },
      up: async () => { await send("mouseUp"); },
    },
    keyboard: {
      type: async (text: string, opts?: { delay?: number }) => { await send("type", { text, delay: opts?.delay }); },
      press: async (key: string) => { await send("press", { key }); },
    },
    // SSRF-guard ставится на стороне runner'а при создании контекста:
    // локальные маршруты здесь были бы no-op и ничего не проверяли.
    route: async () => undefined,
    unroute: async () => undefined,
  } as unknown as Page;

  const context = {
    pages: () => [page],
    newPage: async () => page,
    storageState: async () => {
      // Кэш без запроса был бы всегда пустым: runner отдаёт storageState
      // только по явному действию, поэтому забираем его здесь.
      const fresh = await send<unknown>("storageState").then((r) => r.result).catch(() => undefined);
      if (fresh && typeof fresh === "object") currentStorageState = fresh;
      return (currentStorageState ?? { cookies: [], origins: [] }) as Awaited<ReturnType<BrowserContext["storageState"]>>;
    },
    close: closeRemote,
    route: async () => undefined,
    unroute: async () => undefined,
  } as unknown as BrowserContext;
  const browser = {
    isConnected: () => !closed,
    contexts: () => [context],
    close: closeRemote,
  } as unknown as Browser;
  const session: AgentBrowserSession = {
    browser,
    context,
    page,
    lastSeen: now,
    remote: {
      sessionId,
      getInteractionState: () => currentInteractionState,
      performUiAction: async (action, args, allowedOrigin) => {
        const response = await send<{ url?: string; status?: number | null }>(action, args, allowedOrigin, true);
        if (!response.screenshotBase64) throw new BrowserRpcError("Browser service did not return a page image", 502);
        return {
          screenshot: new Uint8Array(Buffer.from(response.screenshotBase64, "base64")),
          title: response.pageTitle ?? "",
          currentUrl: response.currentUrl ?? currentUrl,
        };
      },
      validate: async () => {
        if (closed) return false;
        try {
          const status = await send<{ open: boolean; url: string }>("status");
          currentUrl = status?.result?.url || currentUrl;
          return Boolean(status?.result?.open);
        } catch {
          return false;
        }
      },
      lastValidatedAt: 0,
    },
  };
  sessions.set(userId, session);
  return session;
}
