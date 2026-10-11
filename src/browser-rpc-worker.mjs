import { acquire, connect, history, limits, sessions } from "@cloudflare/playwright";
import { classifyBrowserAcquireError } from "./browser-run-errors.mjs";

const encoder = new TextEncoder();
const MAX_BODY_CHARS = 256_000;
// Keep the remote browser available while a user works through a short task.
// This is an idle timeout (not a maximum session duration); explicit logout
// closes it immediately and saves the free daily browser allowance.
const SESSION_KEEP_ALIVE_MS = 60_000;
const MAX_RESTORED_FIELDS = 32;
const MAX_FIELD_VALUE_CHARS = 1_000;
const MAX_TRANSFERRED_STORAGE_CHARS = 96_000;

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function transferableStorageState(context) {
  // IndexedDB can contain megabytes of cache. It is unnecessary while the
  // remote session remains alive and makes subsequent signed RPCs too large.
  const state = await context.storageState();
  try {
    return JSON.stringify(state).length <= MAX_TRANSFERRED_STORAGE_CHARS ? state : undefined;
  } catch {
    return undefined;
  }
}

async function dailyBrowserSecondsUsed(binding, now = Date.now()) {
  const utcStart = new Date(now);
  utcStart.setUTCHours(0, 0, 0, 0);
  const startOfDay = utcStart.getTime();
  const [closed, active] = await Promise.all([history(binding), sessions(binding)]);
  const spans = [
    ...closed.map((session) => ({ start: session.startTime, end: session.endTime })),
    ...active.map((session) => ({ start: session.startTime, end: now })),
  ];
  const usedMs = spans.reduce((total, span) => {
    const start = Math.max(startOfDay, Number(span.start));
    const end = Math.min(now, Number(span.end));
    return total + Math.max(0, end - start);
  }, 0);
  return Math.floor(usedMs / 1000);
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

async function verifyRequest(request, rawBody, secret) {
  const timestamp = request.headers.get("x-mekty-timestamp") ?? "";
  const signature = request.headers.get("x-mekty-signature") ?? "";
  const ms = Number(timestamp);
  if (!Number.isSafeInteger(ms) || Math.abs(Date.now() - ms) > 60_000 || !signature) return false;
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`));
  return constantTimeEqual(base64Url(new Uint8Array(mac)), signature);
}

function isPublicV4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 192 && b === 0 && parts[2] === 2) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && parts[2] === 100))) return false;
  if (a === 203 && b === 0 && parts[2] === 113) return false;
  return true;
}

function isPublicV6(address) {
  const host = address.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const first = Number.parseInt(host.split(":")[0] || "0", 16);
  // Only global unicast (2000::/3) is allowed. This also rejects loopback,
  // unspecified, ULA, link-local, multicast, IPv4-mapped, Teredo and 6to4.
  return Number.isFinite(first) && (first & 0xe000) === 0x2000;
}

function isIpLiteral(host) {
  const value = host.replace(/^\[|\]$/g, "");
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return 4;
  if (value.includes(":") && /^[\da-f:.%]+$/i.test(value)) return 6;
  return 0;
}

function isLocalName(host) {
  const value = host.toLowerCase().replace(/\.$/, "");
  return value === "localhost" || value.endsWith(".localhost") || value.endsWith(".local") || value.endsWith(".internal");
}

async function resolvesPublicly(host, cache) {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (cache.has(normalized)) return cache.get(normalized);
  const literal = isIpLiteral(normalized);
  if (literal) {
    const result = literal === 4 ? isPublicV4(normalized) : isPublicV6(normalized);
    cache.set(normalized, result);
    return result;
  }
  if (isLocalName(normalized) || !/^[a-z0-9.-]+$/.test(normalized)) {
    cache.set(normalized, false);
    return false;
  }

  const pending = (async () => {
    try {
      const responses = await Promise.all(["A", "AAAA"].map((type) => {
        const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(normalized)}&type=${type}`;
        return fetch(url, { headers: { Accept: "application/dns-json" }, signal: AbortSignal.timeout(3000) });
      }));
      if (responses.some((response) => !response.ok)) return false;
      const payloads = await Promise.all(responses.map((response) => response.json()));
      const records = payloads.flatMap((payload) => (payload.Answer ?? [])
        .filter((answer) => answer.type === 1 || answer.type === 28)
        .map((answer) => String(answer.data)));
      return records.length > 0 && records.every((ip) => isIpLiteral(ip) === 4 ? isPublicV4(ip) : isPublicV6(ip));
    } catch {
      return false;
    }
  })();
  cache.set(normalized, pending);
  const result = await pending;
  cache.set(normalized, result);
  return result;
}

async function installPublicRequestGuard(page, dnsCache) {
  await page.unroute("**/*").catch(() => {});
  await page.route("**/*", async (route) => {
    try {
      const target = new URL(route.request().url());
      if (["data:", "blob:", "about:"].includes(target.protocol)) {
        await route.continue();
        return;
      }
      if (target.protocol !== "http:" && target.protocol !== "https:") {
        await route.abort();
        return;
      }
      if (await resolvesPublicly(target.hostname, dnsCache)) await route.continue();
      else await route.abort();
    } catch {
      await route.abort().catch(() => {});
    }
  });
}

/**
 * When a page has to be restored after a remote session expired,
 * `domcontentloaded` can be too early for a single-page app. Wait briefly for
 * network activity to settle and then give the renderer one frame. A timeout
 * is harmless for pages with analytics or long-lived connections.
 */
async function waitForVisualPageReady(page, timeout = 5_000) {
  await page.waitForLoadState("load", { timeout: Math.min(timeout, 1_500) }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: Math.min(timeout, 2_000) }).catch(() => {});
  await page.waitForFunction(() => {
    const body = document.body;
    return Boolean(body && (body.innerText.trim() || body.querySelector("input, button, form, main, iframe, canvas, video, img, svg, [role]")));
  }, undefined, { timeout: Math.min(timeout, 2_000) }).catch(() => {});
  await page.waitForTimeout(350).catch(() => {});
}

/**
 * Keep non-password form values as a fallback if Browser Run replaces the
 * page after an idle timeout. The live page normally remains in its session
 * context, so passwords never need to be copied to MongoDB.
 */
async function captureInteractionState(page) {
  return page.evaluate(({ maxFields, maxValueChars }) => {
    const candidates = Array.from(document.querySelectorAll("input, textarea, select, [contenteditable='true']"))
      .filter((element) => {
        const tag = element.tagName.toLowerCase();
        const type = tag === "input" ? element.type.toLowerCase() : "";
        return !element.disabled
          && !["hidden", "password", "file", "submit", "button", "reset", "image"].includes(type)
          && element.getClientRects().length > 0;
      })
      .slice(0, maxFields);
    const activeIndex = candidates.indexOf(document.activeElement);
    const controls = candidates.map((element, index) => {
      const tag = element.tagName.toLowerCase();
      const type = tag === "input" ? element.type.toLowerCase() : tag;
      const item = {
        index,
        tag,
        type,
        id: element.id || "",
        name: element.getAttribute("name") || "",
        placeholder: element.getAttribute("placeholder") || "",
        ariaLabel: element.getAttribute("aria-label") || "",
      };
      if (tag === "input" && (type === "checkbox" || type === "radio")) item.checked = element.checked;
      else if (tag === "select") item.selected = Array.from(element.options).filter((option) => option.selected).map((option) => option.value).slice(0, 20);
      else item.value = String(tag === "input" || tag === "textarea" ? element.value : element.textContent || "").slice(0, maxValueChars);
      return item;
    });
    return { version: 1, activeIndex, controls };
  }, { maxFields: MAX_RESTORED_FIELDS, maxValueChars: MAX_FIELD_VALUE_CHARS }).catch(() => null);
}

async function restoreInteractionState(page, saved) {
  if (!saved || saved.version !== 1 || !Array.isArray(saved.controls)) return;
  await page.evaluate(({ state, maxFields, maxValueChars }) => {
    const candidates = Array.from(document.querySelectorAll("input, textarea, select, [contenteditable='true']"))
      .filter((element) => {
        const tag = element.tagName.toLowerCase();
        const type = tag === "input" ? element.type.toLowerCase() : "";
        return !element.disabled
          && !["hidden", "password", "file", "submit", "button", "reset", "image"].includes(type)
          && element.getClientRects().length > 0;
      })
      .slice(0, maxFields);
    const choose = (saved) => {
      const matches = (element) => {
        const tag = element.tagName.toLowerCase();
        const type = tag === "input" ? element.type.toLowerCase() : tag;
        if (tag !== saved.tag || type !== saved.type) return false;
        if (saved.id) return element.id === saved.id;
        if (saved.name) return element.getAttribute("name") === saved.name;
        if (saved.placeholder) return element.getAttribute("placeholder") === saved.placeholder;
        if (saved.ariaLabel) return element.getAttribute("aria-label") === saved.ariaLabel;
        return candidates[saved.index] === element;
      };
      return candidates.find(matches);
    };
    for (const savedControl of state.controls.slice(0, maxFields)) {
      const element = choose(savedControl);
      if (!element) continue;
      if (savedControl.type === "checkbox" || savedControl.type === "radio") {
        if (typeof savedControl.checked === "boolean") {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
          setter?.call(element, savedControl.checked);
          element.dispatchEvent(new Event("change", { bubbles: true }));
        }
      } else if (element.tagName.toLowerCase() === "select" && Array.isArray(savedControl.selected)) {
        const selected = new Set(savedControl.selected.slice(0, 20).map(String));
        for (const option of element.options) option.selected = selected.has(option.value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (typeof savedControl.value === "string") {
        const value = savedControl.value.slice(0, maxValueChars);
        if (element.isContentEditable) element.textContent = value;
        else {
          const prototype = element.tagName.toLowerCase() === "textarea" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
        }
        element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    const active = state.activeIndex;
    if (Number.isInteger(active) && active >= 0 && active < state.controls.length) {
      const target = choose(state.controls[active]);
      target?.focus({ preventScroll: true });
    }
  }, { state: saved, maxFields: MAX_RESTORED_FIELDS, maxValueChars: MAX_FIELD_VALUE_CHARS }).catch(() => {});
}

async function getOrCreateSessionPage(browser, storageState) {
  const hasSavedState = storageState && typeof storageState === "object";
  const contexts = browser.contexts();
  // A Browser Run session belongs to one app user. Reuse its last context and
  // most recently opened page so focus, form values, and SPA state survive the
  // short-lived Worker request that carried the previous click.
  let context = contexts.at(-1);
  const pages = context?.pages().filter((candidate) => !candidate.isClosed()) ?? [];
  const unusedDefaultContext = pages.length === 0 || pages.every((candidate) => candidate.url() === "about:blank");
  if (!context || (hasSavedState && unusedDefaultContext)) {
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      javaScriptEnabled: true,
      serviceWorkers: "block",
      ...(hasSavedState ? { storageState } : {}),
    });
  }
  const page = context.pages().filter((candidate) => !candidate.isClosed()).at(-1) ?? await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 }).catch(() => {});
  return { context, page };
}

export async function handleBrowserRpc(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!env.AUTH_SECRET || !env.BROWSER) return json({ error: "Browser service is not configured" }, 503);
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_CHARS) return json({ error: "Request too large" }, 413);
  if (!await verifyRequest(request, rawBody, env.AUTH_SECRET)) return json({ error: "Unauthorized" }, 401);

  let body;
  try { body = JSON.parse(rawBody); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!/^[a-f\d]{24}$/i.test(String(body.userId ?? ""))) return json({ error: "Invalid user" }, 400);

  const action = String(body.action ?? "");
  // Read-only, signed diagnostics for account-level throttling. This lets the
  // app distinguish a short acquisition cooldown from occupied browser slots
  // without creating another browser instance or exposing session IDs.
  if (action === "limits") {
    try {
      const current = await limits(env.BROWSER);
      const usedSeconds = await dailyBrowserSecondsUsed(env.BROWSER);
      return json({
        ok: true,
        activeSessionCount: current.activeSessions.length,
        maxConcurrentSessions: current.maxConcurrentSessions,
        allowedBrowserAcquisitions: current.allowedBrowserAcquisitions,
        timeUntilNextAllowedBrowserAcquisition: current.timeUntilNextAllowedBrowserAcquisition,
        dailyBrowserSecondsUsed: usedSeconds,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unable to read Browser Run limits";
      console.error("Browser Run limits could not be read", reason.slice(0, 200));
      return json({ error: "Unable to read Browser Run limits" }, 502);
    }
  }
  if (action === "history") {
    try {
      const recent = await history(env.BROWSER);
      const usedSeconds = await dailyBrowserSecondsUsed(env.BROWSER);
      return json({
        ok: true,
        dailyBrowserSecondsUsed: usedSeconds,
        recent: recent.slice(-12).map((entry) => ({
          startedAt: new Date(entry.startTime).toISOString(),
          endedAt: new Date(entry.endTime).toISOString(),
          durationSeconds: Math.max(0, Math.round((entry.endTime - entry.startTime) / 1000)),
          closeReason: entry.closeReasonText,
        })),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unable to read Browser Run history";
      console.error("Browser Run history could not be read", reason.slice(0, 200));
      return json({ error: "Unable to read Browser Run history" }, 502);
    }
  }

  if (action === "create") {
    try {
      const acquired = await acquire(env.BROWSER, {
        keep_alive: SESSION_KEEP_ALIVE_MS,
      });
      return json({ sessionId: acquired.sessionId, currentUrl: "about:blank" });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error("Browser Run could not create a session", reason.slice(0, 300));
      const dailyUsage = /rate.?limit|429/i.test(reason)
        ? await dailyBrowserSecondsUsed(env.BROWSER).catch(() => 0)
        : 0;
      const failure = classifyBrowserAcquireError(error, dailyUsage);
      return json(failure, failure.status);
    }
  }

  const sessionId = String(body.sessionId ?? "");
  if (!/^[a-f\d-]{36}$/i.test(sessionId)) return json({ error: "Browser session is missing" }, 400);
  if (action === "close") {
    try {
      const browser = await connect(env.BROWSER, sessionId);
      await browser.close();
      return json({ ok: true, sessionId });
    } catch {
      return json({ ok: true, sessionId });
    }
  }

  let browser;
  let context;
  try {
    browser = await connect(env.BROWSER, sessionId);
    if (action === "status") {
      return json({ ok: true, sessionId, currentUrl: String(body.currentUrl ?? "about:blank"), result: { open: true, url: String(body.currentUrl ?? "about:blank") } });
    }

    const sessionPage = await getOrCreateSessionPage(browser, body.storageState);
    context = sessionPage.context;
    const page = sessionPage.page;
    const dnsCache = new Map();
    const requestedOrigin = typeof body.allowedOrigin === "string" && /^https?:\/\//i.test(body.allowedOrigin)
      ? new URL(body.allowedOrigin).origin
      : null;
    await installPublicRequestGuard(page, dnsCache);

    const args = body.args && typeof body.args === "object" ? body.args : {};
    let restoredPage = false;
    let interactionState = action === "navigate" ? undefined : body.interactionState;
    if (action !== "navigate") {
      let activeUrl = page.url();
      if (activeUrl === "about:blank" && typeof body.currentUrl === "string" && /^https?:\/\//i.test(body.currentUrl)) {
        activeUrl = body.currentUrl;
        const restore = new URL(activeUrl);
        if (!(await resolvesPublicly(restore.hostname, dnsCache))) {
          return json({ error: "Запрос во внутреннюю сеть запрещён" }, 403);
        }
        await page.goto(restore.toString(), { waitUntil: "domcontentloaded", timeout: 15_000 });
        await waitForVisualPageReady(page);
        await restoreInteractionState(page, interactionState);
        restoredPage = true;
      } else if (/^https?:\/\//i.test(activeUrl)) {
        const current = new URL(activeUrl);
        if (!(await resolvesPublicly(current.hostname, dnsCache))) {
          return json({ error: "Запрос во внутреннюю сеть запрещён" }, 403);
        }
        // The same marked page stays alive across API requests, preserving DOM,
        // focus, React state, and password inputs. Never reload it just to make
        // another screenshot.
        restoredPage = true;
      }
      if (!restoredPage && typeof body.currentUrl === "string" && /^https?:\/\//i.test(body.currentUrl)) {
        const restore = new URL(body.currentUrl);
        if (!(await resolvesPublicly(restore.hostname, dnsCache))) {
        return json({ error: "Запрос во внутреннюю сеть запрещён" }, 403);
      }
      await page.goto(restore.toString(), { waitUntil: "domcontentloaded", timeout: 15_000 });
      await waitForVisualPageReady(page);
      await restoreInteractionState(page, interactionState);
      restoredPage = true;
    }
    }
    let result;
    switch (action) {
      case "status": result = { open: !page.isClosed(), url: page.url() }; break;
      case "navigate": {
        const target = new URL(String(args.url ?? ""));
        if (!requestedOrigin || target.origin !== requestedOrigin || !(await resolvesPublicly(target.hostname, dnsCache))) {
          return json({ error: "Запрос во внутреннюю сеть запрещён" }, 403);
        }
        const response = await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: Math.min(Number(args.timeoutMs ?? 15000), 25000) });
        await waitForVisualPageReady(page);
        result = { url: page.url(), status: response?.status() ?? null };
        break;
      }
      case "screenshot": {
        // A screenshot request can follow a restore above, or be made while a
        // page is finishing client-side rendering. This prevents returning a
        // transient blank screen to the workspace UI.
        if (!restoredPage) await waitForVisualPageReady(page, 3_000);
        if (!body.captureScreenshot) {
          const screenshot = await page.screenshot({ type: "jpeg", quality: Math.max(30, Math.min(90, Number(args.quality ?? 75))) });
          const headers = new Headers({
            "Content-Type": "image/jpeg",
            "Cache-Control": "no-store",
            "X-Mekty-Session": sessionId,
            "X-Page-Title": encodeURIComponent(await page.title().catch(() => "")),
            "X-Page-Url": encodeURIComponent(page.url()),
          });
          return new Response(screenshot, { headers });
        }
        result = null;
        break;
      }
      case "click": await page.mouse.click(Number(args.x ?? 0), Number(args.y ?? 0), { clickCount: Math.max(1, Math.min(2, Number(args.clickCount ?? 1))) }); await waitForVisualPageReady(page, 3_000); result = null; break;
      case "move": await page.mouse.move(Number(args.x ?? 0), Number(args.y ?? 0)); result = null; break;
      case "wheel": await page.mouse.wheel(Number(args.dx ?? 0), Number(args.dy ?? 0)); result = null; break;
      case "down": await page.mouse.down(); result = null; break;
      case "up": await page.mouse.up(); result = null; break;
      case "type": await page.keyboard.type(String(args.text ?? "").slice(0, 5000), { delay: 10 }); await page.waitForTimeout(200); result = null; break;
      case "press": await page.keyboard.press(String(args.key ?? "Enter").slice(0, 40)); await waitForVisualPageReady(page, 3_000); result = null; break;
      case "back": await page.goBack({ waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => null); await waitForVisualPageReady(page, 3_000); result = null; break;
      case "forward": await page.goForward({ waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => null); await waitForVisualPageReady(page, 3_000); result = null; break;
      case "reload": await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => null); await waitForVisualPageReady(page, 3_000); result = null; break;
      case "wait": await page.waitForTimeout(Math.max(0, Math.min(5000, Number(args.ms ?? 0)))); result = null; break;
      case "url": result = page.url(); break;
      case "title": result = await page.title(); break;
      case "evaluate": {
        const script = String(args.script ?? "");
        if (script.length > 20000) return json({ error: "Page script too large" }, 413);
        result = await page.evaluate(script, args.arg);
        break;
      }
      case "storageState": result = await transferableStorageState(context); break;
      default: return json({ error: "Unknown browser action" }, 400);
    }

    const storageState = await transferableStorageState(context);
    interactionState = await captureInteractionState(page);
    const response = { ok: true, sessionId, currentUrl: page.url(), storageState, interactionState, result };
    if (body.captureScreenshot) {
      const screenshot = await page.screenshot({ type: "jpeg", quality: Math.max(30, Math.min(90, Number(args.quality ?? 75))) });
      response.pageTitle = await page.title().catch(() => "");
      response.screenshotBase64 = base64(screenshot);
    }
    return json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Browser action failed";
    const status = /session.*not found|invalid session|browser.*closed|no session/i.test(message) ? 410 : 502;
    return json({ error: message.slice(0, 300), status }, status);
  } finally {
    // Preserve the remote context/page between RPCs. Closing either one drops
    // focus and SPA state; browser.close() also ends the reusable Browser Run
    // session. Explicit "close" and Cloudflare's idle timeout release it.
  }
}
