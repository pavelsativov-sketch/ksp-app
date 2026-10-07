import type { Browser, BrowserContext, Page } from "playwright";
import { launch as launchCloudflareBrowser, type BrowserWorker } from "@cloudflare/playwright";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getDb, COL } from "@/lib/mongo";
import { checkPublicUrl, installRequestGuard } from "@/lib/agents/ssrf";

export interface AgentBrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  lastSeen: number;
}

// Cloudflare Free allows only 10 browser minutes per day. Persist cookies and
// release an idle remote browser after one minute instead of holding a slot.
const SESSION_TTL_MS = 5 * 60_000;
const sessions = new Map<string, AgentBrowserSession>();
const opening = new Map<string, Promise<AgentBrowserSession>>();

/** Browser Run in Workers; native Playwright is reserved for local Node development. */
export async function launchAgentBrowser(): Promise<Browser> {
  let cloudflareContext: Awaited<ReturnType<typeof getCloudflareContext>> | null = null;
  try {
    cloudflareContext = await getCloudflareContext({ async: true });
  } catch {
    // Normal Next.js Node development does not have a Workers request context.
  }

  if (cloudflareContext) {
    const binding = (cloudflareContext.env as typeof cloudflareContext.env & { BROWSER?: BrowserWorker }).BROWSER;
    if (!binding) throw new Error("Cloudflare Browser Run binding BROWSER is not configured");
    // The Cloudflare fork exposes the same browser operations used below but
    // intentionally omits Playwright's Node-only bind/unbind methods.
    return await launchCloudflareBrowser(binding, { keep_alive: SESSION_TTL_MS }) as unknown as Browser;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Browser Run is unavailable: no Cloudflare request context");
  }
  const localPackage = "playwright";
  const { chromium } = await import(localPackage);
  return chromium.launch({ headless: true });
}

export function browserFailure(error: unknown): { message: string; status: number } {
  const detail = error instanceof Error ? error.message : String(error);
  if (/429|rate.?limit|quota|time limit exceeded|too many browsers/i.test(detail)) {
    return {
      message: "Достигнут бесплатный лимит Cloudflare Browser Run: 10 минут в день и до 3 одновременных браузеров. Попробуйте после сброса дневного лимита.",
      status: 429,
    };
  }
  return { message: "Облачный браузер временно недоступен. Попробуйте ещё раз позже.", status: 503 };
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
  storageState: Awaited<ReturnType<BrowserContext["storageState"]>>;
  currentUrl?: string;
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
    if (value.storageState && typeof value.storageState === "object") {
      return {
        storageState: value.storageState as SavedBrowserState["storageState"],
        currentUrl: typeof value.currentUrl === "string" ? value.currentUrl : undefined,
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export async function persistAgentBrowserSession(userId: string): Promise<void> {
  const session = sessions.get(userId);
  if (!session || session.page.isClosed()) return;
  const state = await session.context.storageState({ indexedDB: true });
  const currentUrl = /^https?:\/\//i.test(session.page.url()) ? session.page.url() : undefined;
  const db = await getDb();
  await db.collection(COL.agentBrowserSessions).updateOne(
    { user_id: userId },
    { $set: { encrypted_state: encryptState(JSON.stringify({ storageState: state, currentUrl })), updated_at: new Date() }, $setOnInsert: { created_at: new Date() } },
    { upsert: true },
  );
}

export async function clearAgentBrowserSession(userId: string): Promise<void> {
  const session = sessions.get(userId);
  sessions.delete(userId);
  if (session) {
    await session.context.close().catch(() => {});
    await session.browser.close().catch(() => {});
  }
  const db = await getDb();
  await db.collection(COL.agentBrowserSessions).deleteOne({ user_id: userId });
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
    current.lastSeen = now;
    return current;
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

  const browser = await launchAgentBrowser();
  const stored = await readStoredState(userId).catch(() => undefined);
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
