import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browserRpc, BrowserRpcError } from "@/lib/agents/browser-rpc";

const AUTH_SECRET = "test-secret-that-is-definitely-longer-than-32-chars";

/**
 * BROWSER_RPC_URL читался один раз на уровне модуля. Из-за этого «нет адреса»
 * кэшировалось навсегда: подключить runner в dev или перезалить .env без
 * перезапуска процесса было невозможно.
 */
describe("browserRpc configuration", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = AUTH_SECRET;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.BROWSER_RPC_URL;
    process.env.AUTH_SECRET = AUTH_SECRET;
  });

  it("reports an unconfigured runner as a temporary service error", async () => {
    delete process.env.BROWSER_RPC_URL;

    await expect(browserRpc("user-1", "status")).rejects.toMatchObject({
      name: "BrowserRpcError",
      status: 503,
    });
  });

  it("picks up BROWSER_RPC_URL assigned after the module was imported", async () => {
    delete process.env.BROWSER_RPC_URL;
    // Первый вызов «запоминает» отсутствие адреса — при старом коде здесь
    // был бы вечный 503, и второй вызов уже не дошёл бы до fetch.
    await expect(browserRpc("user-1", "status")).rejects.toBeInstanceOf(BrowserRpcError);

    process.env.BROWSER_RPC_URL = "http://127.0.0.1:9/_agent/browser";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { open: true, url: "about:blank" } }), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await browserRpc("user-1", "status");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(response.result).toEqual({ open: true, url: "about:blank" });
  });

  it("refuses to sign a request without a long enough AUTH_SECRET", async () => {
    process.env.BROWSER_RPC_URL = "http://127.0.0.1:9/_agent/browser";
    process.env.AUTH_SECRET = "short";

    await expect(browserRpc("user-1", "status")).rejects.toThrow(/AUTH_SECRET/);
  });

  it("forwards action arguments and the screenshot flag to the runner", async () => {
    process.env.BROWSER_RPC_URL = "http://127.0.0.1:9/_agent/browser";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, screenshotBase64: "aGk=" }), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await browserRpc("user-1", "click", { sessionId: "s-1", captureScreenshot: true, args: { x: 1, y: 2 } });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.captureScreenshot).toBe(true);
    expect(body.sessionId).toBe("s-1");
    expect(body.args).toEqual({ x: 1, y: 2 });
  });
});