import { createHmac } from "node:crypto";
import { log } from "@/lib/logger";
import { getBrowserTarget } from "@/lib/agents/runtime-mode";

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

/**
 * Секрет HMAC-подписи для браузерного раннера в песочнице.
 *
 * Секрет выводится из AUTH_SECRET на пользователя: конфиг раннера лежит в
 * песочнице учителя (/tmp/runner-config.json), поэтому глобальный AUTH_SECRET
 * туда писать нельзя — учитель (или агент под промпт-инъекцией) мог бы прочитать
 * его и подделывать RPC-запросы к чужим песочницам. Производный секрет позволяет
 * подделывать только свой.
 */
export function getRunnerRpcSecret(userId: string): string {
  const auth = process.env.AUTH_SECRET;
  if (!auth || auth.length < 32) {
    throw new Error("AUTH_SECRET is not configured for browser service (нужно минимум 32 символа)");
  }
  return createHmac("sha256", auth)
    .update(`browser-runner:${userId}`)
    .digest("base64url")
    .slice(0, 43);
}

/**
 * Единственное место, где решается, КУДА идёт браузерный RPC: в персональную
 * Vercel Sandbox пользователя. Вне Vercel — честная ошибка 503.
 */
export async function resolveRunnerUrl(userId: string): Promise<string> {
  if (getBrowserTarget() !== "vercel-sandbox") {
    throw new BrowserRpcError("Браузер рабочей области работает только на опубликованном сайте (Vercel Sandbox).", 503);
  }
  const { getSandboxBrowserRpcUrl } = await import("@/lib/agents/sandbox-browser-service");
  return getSandboxBrowserRpcUrl(userId);
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
  // Единый выбор раннера для агента, вкладки «Браузер» и keepalive.
  const rpcUrl = options.rpcUrl ?? await resolveRunnerUrl(userId);
  const secret = getRunnerRpcSecret(userId);

  const { storageState, ...rest } = options;
  const safeStorageState = transferableStorageState(storageState);
  const body = JSON.stringify({ userId, action, ...rest, ...(safeStorageState ? { storageState: safeStorageState } : {}) });
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", encoder.encode(secret))
    .update(`${timestamp}.${body}`)
    .digest();
  // Ретраи с экспоненциальным backoff: раннер может быть занят прогреванием
  // (503) или временно недоступен по сети. Раньше любой сбой сразу валил
  // весь шаг агента.
  const RPC_ATTEMPTS = 3;
  let response: Response | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < RPC_ATTEMPTS; attempt++) {
    try {
      const r = await fetch(rpcUrl, {
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
      // 502/503 — раннер ещё не готов или перезагружается: пробуем ещё.
      if (attempt < RPC_ATTEMPTS - 1 && (r.status === 502 || r.status === 503)) {
        log.warn("[AI Browser RPC] раннер не готов, повторяем", { attempt: attempt + 1, status: r.status });
        await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
        continue;
      }
      response = r;
      break;
    } catch (error) {
      lastError = error;
      if (attempt < RPC_ATTEMPTS - 1) {
        log.warn("[AI Browser RPC] сетевой сбой, повторяем", { attempt: attempt + 1, error: error instanceof Error ? error.message : String(error) });
        await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
        continue;
      }
    }
  }

  if (!response) {
    const message = lastError instanceof Error ? lastError.message : "Browser service request failed";
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
