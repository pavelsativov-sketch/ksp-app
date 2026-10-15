import type { Browser, BrowserContext, Page } from "playwright";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getDb, COL } from "@/lib/mongo";
import { checkPublicUrl, installRequestGuard } from "@/lib/agents/ssrf";
import { browserRpc, BrowserRpcError, createBrowserRpcSession } from "@/lib/agents/browser-rpc";
import { log } from "@/lib/logger";
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
  getInteractionState: () => unknown;
  performUiAction: (action: string, args?: Record<string, unknown>, allowedOrigin?: string) => Promise<{ screenshot: Uint8Array; title: string; currentUrl: string }>;
}

const SESSION_TTL_MS = 5 * 60_000;
const sessions = new Map<string, AgentBrowserSession>();
const opening = new Map<string, Promise<AgentBrowserSession>>();

/** Запуск стандартного Playwright Chromium (в Vercel Sandbox или локально в Node.js). */
export async function launchAgentBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright");
  return chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });
}

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
    // Сессия Codespaces восстанавливается по sessionId даже без storageState,
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
  } else if (process.env.VERCEL === "1") {
    const stored = await readStoredState(userId).catch(() => undefined);
    if (stored?.sessionId) {
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

/** Один настоящий браузерный контекст на пользователя, общий для UI и агента. */
export async function getAgentBrowserSession(userId: string): Promise<AgentBrowserSession> {
  if (!userId || userId.length > 128) throw new Error("Invalid browser session owner");
  const now = Date.now();
  reapSessions(now);

  const current = sessions.get(userId);
  if (current && current.browser.isConnected() && !current.page.isClosed()) {
    if (current.remote && !await current.remote.validate()) {
      sessions.delete(userId);
    } else {
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
  if (process.env.VERCEL === "1") {
    // Автономный облачный браузер внутри Vercel Sandbox
    try {
      const { getSandboxBrowserRpcUrl } = await import("@/lib/agents/sandbox-browser-service");
      const rpcUrl = await getSandboxBrowserRpcUrl(userId);
      if (stored?.sessionId) {
        const remote = createRemoteSession(userId, stored.sessionId, stored.currentUrl, stored.storageState, stored.interactionState, now, rpcUrl);
        if (await remote.remote!.validate()) return remote;
      }
      const created = await createBrowserRpcSession(userId, {
        storageState: stored?.storageState,
        currentUrl: stored?.currentUrl,
        rpcUrl,
      });
      return createRemoteSession(userId, created.sessionId!, stored?.currentUrl ?? created.currentUrl, stored?.storageState, stored?.interactionState, now, rpcUrl);
    } catch (e) {
      log.error("browser-session: Vercel Sandbox runner unavailable", { userId, error: String(e) });
      throw new BrowserRpcError(e instanceof Error ? e.message : "Облачный браузер запускается в песочнице Vercel. Пожалуйста, подождите несколько секунд и повторите.", 503);
    }
  }

  const browser = await launchAgentBrowser();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    javaScriptEnabled: true,
    serviceWorkers: "block",
    ...(stored?.storageState ? { storageState: stored.storageState } : {}),
  });
  const page = await context.newPage();
  if (stored?.currentUrl) {
    const checked = await checkPublicUrl(stored.currentUrl);
    if (checked.ok) {
      await installRequestGuard(page);
      await page.goto(checked.url.toString(), { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {});
    }
  }
  const session = { browser, context, page, lastSeen: now };
  sessions.set(userId, session);
  return session;
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
    const response = await browserRpc<T>(userId, action, {
      sessionId,
      currentUrl,
      interactionState: currentInteractionState,
      rpcUrl,
      ...(allowedOrigin ? { allowedOrigin } : {}),
      ...(captureScreenshot ? { captureScreenshot: true } : {}),
      ...(args ? { args } : {}),
      timeoutMs: action === "navigate" ? 35_000 : 55_000,
    });
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
      click: async (x: number, y: number, opts?: { clickCount?: number }) => { await send("click", { x, y, clickCount: opts?.clickCount }); },
      move: async (x: number, y: number) => { await send("move", { x, y }); },
      wheel: async (dx: number, dy: number) => { await send("wheel", { dx, dy }); },
      down: async () => { await send("mouseDown"); },
      up: async () => { await send("mouseUp"); },
    },
    keyboard: {
      type: async (text: string) => { await send("type", { text }); },
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
          currentUrl = status.result.url || currentUrl;
          return status.result.open;
        } catch (error) {
          if (error instanceof BrowserRpcError && error.status === 410) return false;
          throw error;
        }
      },
    },
  };
  sessions.set(userId, session);
  return session;
}
