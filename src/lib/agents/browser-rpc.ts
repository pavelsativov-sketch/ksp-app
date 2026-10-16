import { createHmac } from "node:crypto";

const encoder = new TextEncoder();
// Раннер принимает тело до 256 КБ. Снимки IndexedDB со сторонних сайтов
// бывают на несколько мегабайт, поэтому в запрос восстанавливаемой сессии
// переносим только ограниченный кусок состояния. Сама живая сессия целиком
// остаётся в песочнице.
const MAX_TRANSFERRED_STORAGE_CHARS = 96_000;

export interface BrowserRpcState {
  sessionId: string;
  currentUrl?: string;
  storageState?: unknown;
  interactionState?: unknown;
}

export class BrowserRpcError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "BrowserRpcError";
  }
}

function encodeBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function transferableStorageState(value: unknown): unknown {
  if (!value || typeof value !== "object") return undefined;
  try {
    return JSON.stringify(value).length <= MAX_TRANSFERRED_STORAGE_CHARS ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function browserRpc<T = unknown>(
  userId: string,
  action: string,
  options: {
    sessionId?: string;
    currentUrl?: string;
    storageState?: unknown;
    interactionState?: unknown;
    allowedOrigin?: string;
    captureScreenshot?: boolean;
    args?: Record<string, unknown>;
    timeoutMs?: number;
    rpcUrl?: string;
  } = {},
): Promise<{ sessionId?: string; currentUrl?: string; pageTitle?: string; result: T; storageState?: unknown; interactionState?: unknown; screenshotBase64?: string }> {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET is not configured for browser service");

  // Единственный источник адреса — персональная Vercel Sandbox. Раньше здесь
  // был ещё запасной путь `BROWSER_RPC_URL` на внешний раннер; он остался от
  // Codespaces, на Vercel всё равно не читался и только путал при развёртывании.
  let rpcUrl = options.rpcUrl;
  if (!rpcUrl) {
    if (process.env.VERCEL !== "1") {
      throw new BrowserRpcError(
        "Облачный браузер рабочей области доступен только на Vercel.",
        503,
      );
    }
    const { getSandboxBrowserRpcUrl } = await import("@/lib/agents/sandbox-browser-service");
    rpcUrl = await getSandboxBrowserRpcUrl(userId);
  }

  const { storageState, ...rest } = options;
  const safeStorageState = transferableStorageState(storageState);
  const body = JSON.stringify({ userId, action, ...rest, ...(safeStorageState ? { storageState: safeStorageState } : {}) });
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", encoder.encode(secret))
    .update(`${timestamp}.${body}`)
    .digest();
  let response: Response;
  try {
    response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mekty-timestamp": timestamp,
        "x-mekty-signature": encodeBase64Url(signature),
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(Math.max(5_000, Math.min(options.timeoutMs ?? 55_000, 60_000))),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Browser service request failed";
    throw new BrowserRpcError(message, 503);
  }

  if (response.headers.get("content-type")?.startsWith("image/")) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      sessionId: response.headers.get("X-Mekty-Session") ?? undefined,
      currentUrl: decodeURIComponent(response.headers.get("X-Page-Url") ?? "") || undefined,
      result: bytes as T,
    };
  }

  let payload: { error?: string; result?: T; sessionId?: string; currentUrl?: string; pageTitle?: string; storageState?: unknown; interactionState?: unknown; screenshotBase64?: string };
  try {
    payload = await response.json() as typeof payload;
  } catch {
    throw new BrowserRpcError(`Browser service returned HTTP ${response.status}`, response.status);
  }
  if (!response.ok || payload.error) {
    throw new BrowserRpcError(payload.error ?? `Browser service returned HTTP ${response.status}`, response.status);
  }
  return payload as { sessionId?: string; currentUrl?: string; pageTitle?: string; result: T; storageState?: unknown; interactionState?: unknown; screenshotBase64?: string };
}

export async function createBrowserRpcSession(userId: string, state?: Omit<BrowserRpcState, "sessionId"> & { rpcUrl?: string }) {
  return browserRpc<{ sessionId: string; currentUrl?: string }>(userId, "create", state);
}
