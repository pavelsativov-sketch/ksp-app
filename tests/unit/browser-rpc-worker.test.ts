import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cloudflare = vi.hoisted(() => ({
  acquire: vi.fn(),
  connect: vi.fn(),
  history: vi.fn(),
  limits: vi.fn(),
  sessions: vi.fn(),
}));

vi.mock("@cloudflare/playwright", () => cloudflare);

import { handleBrowserRpc } from "../../src/browser-rpc-worker.mjs";

const AUTH_SECRET = "test-browser-secret-with-at-least-32-characters-long";
const USER_ID = "0123456789abcdef01234567";
const SESSION_ID = "01234567-89ab-cdef-0123-456789abcdef";

function createBrowserFixture() {
  let currentUrl = "about:blank";
  const page = {
    isClosed: () => false,
    url: () => currentUrl,
    setViewportSize: vi.fn(async () => {}),
    unroute: vi.fn(async () => {}),
    route: vi.fn(async () => {}),
    goto: vi.fn(async (url: string) => { currentUrl = url; return { status: () => 200 }; }),
    waitForLoadState: vi.fn(async () => {}),
    waitForTimeout: vi.fn(async () => {}),
    waitForFunction: vi.fn(async () => {}),
    evaluate: vi.fn(async () => ({ version: 1, activeIndex: -1, controls: [] })),
    title: vi.fn(async () => "BilimClass login"),
    screenshot: vi.fn(async () => new Uint8Array([255, 216, 255, 217])),
    mouse: { click: vi.fn(async () => {}) },
    keyboard: { type: vi.fn(async () => {}), press: vi.fn(async () => {}) },
    goBack: vi.fn(async () => null),
    goForward: vi.fn(async () => null),
    reload: vi.fn(async () => null),
  };
  const context = {
    pages: () => [page],
    newPage: vi.fn(async () => page),
    storageState: vi.fn(async () => ({ cookies: [], origins: [] })),
    close: vi.fn(async () => {}),
  };
  const browser = {
    contexts: () => [context],
    newContext: vi.fn(async () => context),
    close: vi.fn(async () => {}),
  };
  return { browser, context, page };
}

async function signedRequest(action: string, fields: Record<string, unknown> = {}) {
  const timestamp = String(Date.now());
  const body = JSON.stringify({ userId: USER_ID, action, ...fields });
  const signature = createHmac("sha256", AUTH_SECRET).update(`${timestamp}.${body}`).digest("base64url");
  return new Request("https://worker.example/_agent/browser", {
    method: "POST",
    headers: { "x-mekty-timestamp": timestamp, "x-mekty-signature": signature },
    body,
  });
}

describe("Browser Run remote workspace session", () => {
  const fixture = createBrowserFixture();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const type = new URL(String(input)).searchParams.get("type");
      const Answer = type === "A" ? [{ type: 1, data: "93.184.216.34" }] : [];
      return new Response(JSON.stringify({ Answer }), { status: 200 });
    }));
    cloudflare.acquire.mockResolvedValue({ sessionId: SESSION_ID });
    cloudflare.connect.mockResolvedValue(fixture.browser);
    cloudflare.limits.mockResolvedValue({
      activeSessions: [],
      maxConcurrentSessions: 3,
      allowedBrowserAcquisitions: 1,
      timeUntilNextAllowedBrowserAcquisition: 0,
    });
    cloudflare.history.mockResolvedValue([]);
    cloudflare.sessions.mockResolvedValue([]);
  });

  it("keeps the browser page alive between navigation and manual input actions", async () => {
    const env = { AUTH_SECRET, BROWSER: {} };
    const created = await handleBrowserRpc(await signedRequest("create"), env);
    expect(created.status).toBe(200);

    const navigation = await handleBrowserRpc(await signedRequest("navigate", {
      sessionId: SESSION_ID,
      allowedOrigin: "https://www.bilimclass.kz",
      args: { url: "https://www.bilimclass.kz/login" },
      captureScreenshot: true,
    }), env);
    const navigationResult = await navigation.json() as { currentUrl: string; screenshotBase64: string };
    expect(navigationResult.currentUrl).toBe("https://www.bilimclass.kz/login");
    expect(navigationResult.screenshotBase64).toBeTruthy();

    await handleBrowserRpc(await signedRequest("click", {
      sessionId: SESSION_ID,
      currentUrl: navigationResult.currentUrl,
      interactionState: { version: 1, activeIndex: -1, controls: [] },
      args: { x: 240, y: 210 },
      captureScreenshot: true,
    }), env);

    expect(fixture.page.goto).toHaveBeenCalledTimes(1);
    expect(fixture.page.mouse.click).toHaveBeenCalledWith(240, 210, { clickCount: 1 });
    expect(fixture.browser.newContext).not.toHaveBeenCalled();
    expect(fixture.context.close).not.toHaveBeenCalled();
    expect(fixture.browser.close).not.toHaveBeenCalled();
  });

  it("sends manual text to the focused page and preserves the reusable session", async () => {
    const response = await handleBrowserRpc(await signedRequest("type", {
      sessionId: SESSION_ID,
      currentUrl: "https://www.bilimclass.kz/login",
      args: { text: "test-user@example.invalid" },
      captureScreenshot: true,
    }), { AUTH_SECRET, BROWSER: {} });

    expect(response.status).toBe(200);
    expect(fixture.page.keyboard.type).toHaveBeenCalledWith("test-user@example.invalid", { delay: 10 });
    expect(fixture.context.close).not.toHaveBeenCalled();
    expect(fixture.browser.close).not.toHaveBeenCalled();
  });

  it("closes the reusable browser only on an explicit close action", async () => {
    const response = await handleBrowserRpc(await signedRequest("close", { sessionId: SESSION_ID }), {
      AUTH_SECRET,
      BROWSER: {},
    });

    expect(response.status).toBe(200);
    expect(fixture.browser.close).toHaveBeenCalledOnce();
  });

  it("reports account acquisition limits without creating a browser", async () => {
    const response = await handleBrowserRpc(await signedRequest("limits"), { AUTH_SECRET, BROWSER: {} });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      activeSessionCount: 0,
      maxConcurrentSessions: 3,
      allowedBrowserAcquisitions: 1,
      timeUntilNextAllowedBrowserAcquisition: 0,
      dailyBrowserSecondsUsed: 0,
    });
    expect(cloudflare.acquire).not.toHaveBeenCalled();
  });

  it("reports recent session close reasons without exposing session IDs", async () => {
    cloudflare.history.mockResolvedValueOnce([{
      sessionId: SESSION_ID,
      startTime: 1000,
      endTime: 6500,
      closeReason: 2,
      closeReasonText: "BrowserIdle",
    }]);

    const response = await handleBrowserRpc(await signedRequest("history"), { AUTH_SECRET, BROWSER: {} });
    const result = await response.json() as { recent: Array<Record<string, unknown>> };

    expect(result).toMatchObject({
      dailyBrowserSecondsUsed: 0,
      recent: [{
        startedAt: new Date(1000).toISOString(),
        endedAt: new Date(6500).toISOString(),
        durationSeconds: 6,
        closeReason: "BrowserIdle",
      }],
    });
    expect(JSON.stringify(result)).not.toContain(SESSION_ID);
  });
});
