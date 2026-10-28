import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browserRpc, getRunnerRpcSecret } from "@/lib/agents/browser-rpc";

const getSandboxBrowserRpcUrl = vi.fn(async () => RPC_URL);
vi.mock("@/lib/agents/sandbox-browser-service", () => ({ getSandboxBrowserRpcUrl }));

const AUTH_SECRET = "test-secret-that-is-definitely-longer-than-32-chars";
const RPC_URL = "https://sandbox-3000.example.vercel.run/_agent/browser";

/**
 * Браузер ОС живёт либо в персональной Vercel Sandbox, либо на внешнем
 * раннере (ПК учителя за Cloudflare Tunnel), если задан `BROWSER_RPC_URL`.
 * Общий `BROWSER_RPC_SECRET` относится только ко второму случаю.
 */
describe("browserRpc configuration", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = AUTH_SECRET;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    getSandboxBrowserRpcUrl.mockClear();
    delete process.env.VERCEL;
    delete process.env.BROWSER_RPC_URL;
    delete process.env.BROWSER_RPC_SECRET;
  });

  it("refuses to sign a request without a long enough AUTH_SECRET", async () => {
    // Отдельный ключ раннера не должен маскировать короткий AUTH_SECRET.
    delete process.env.BROWSER_RPC_SECRET;
    process.env.AUTH_SECRET = "short";

    await expect(browserRpc("user-1", "status", { rpcUrl: RPC_URL })).rejects.toThrow(/AUTH_SECRET/);
  });

  it("reports that the cloud browser exists only on Vercel", async () => {
    delete process.env.VERCEL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(browserRpc("user-1", "status")).rejects.toMatchObject({
      name: "BrowserRpcError",
      status: 503,
    });
    // Важно: не пытаемся ходить наружу, когда раннера заведомо нет.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("without BROWSER_RPC_URL the runner url comes from the Vercel sandbox", async () => {
    process.env.VERCEL = "1";
    delete process.env.BROWSER_RPC_URL;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { open: true } }), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await browserRpc("user-1", "status");

    expect(getSandboxBrowserRpcUrl).toHaveBeenCalledWith("user-1");
    expect(fetchMock.mock.calls[0][0]).toBe(RPC_URL);
  });

  it("uses an explicitly provided runner url and signs the request", async () => {
    delete process.env.VERCEL;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { open: true, url: "about:blank" } }), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await browserRpc("user-1", "status", { rpcUrl: RPC_URL, sessionId: "s-1" });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(RPC_URL);
    expect(response.result).toEqual({ open: true, url: "about:blank" });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    const rawBody = init.body as string;
    const timestamp = headers["x-mekty-timestamp"];
    // Подпись считается производным секретом пользователя.
    const expected = createHmac("sha256", Buffer.from(getRunnerRpcSecret("user-1")))
      .update(`${timestamp}.${rawBody}`)
      .digest("base64url");
    expect(headers["x-mekty-signature"]).toBe(expected);
  });

  it("signs sandbox requests with a per-user secret derived from AUTH_SECRET (the global secret never leaves the app)", async () => {
    const runnerSecret = "runner-secret-that-is-definitely-longer-than-32-chars";
    process.env.BROWSER_RPC_SECRET = runnerSecret;
    process.env.BROWSER_RPC_URL = "https://browser.example.com/_agent/browser";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { open: true } }), { headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    // Даже если в окружении остался старый BROWSER_RPC_SECRET, он не используется.
    await browserRpc("user-1", "status", { rpcUrl: RPC_URL, sessionId: "s-1" });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    const derived = createHmac("sha256", Buffer.from(getRunnerRpcSecret("user-1")))
      .update(`${headers["x-mekty-timestamp"]}.${init.body as string}`)
      .digest("base64url");
    expect(headers["x-mekty-signature"]).toBe(derived);
    expect(getRunnerRpcSecret("user-1")).not.toBe(runnerSecret);
    // Разным пользователям — разные ключи: утечка одного не открывает чужие песочницы.
    expect(getRunnerRpcSecret("user-1")).not.toBe(getRunnerRpcSecret("user-2"));
  });

  it("forwards action arguments and the screenshot flag to the runner", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, screenshotBase64: "aGk=" }), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await browserRpc("user-1", "click", { rpcUrl: RPC_URL, sessionId: "s-1", captureScreenshot: true, args: { x: 1, y: 2 } });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.captureScreenshot).toBe(true);
    expect(body.sessionId).toBe("s-1");
    expect(body.args).toEqual({ x: 1, y: 2 });
  });

  it("drops an oversized storageState instead of sending a body the runner rejects", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const huge = { cookies: [{ name: "x", value: "y".repeat(200_000) }], origins: [] };
    await browserRpc("user-1", "create", { rpcUrl: RPC_URL, storageState: huge });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty("storageState");
  });

  it("returns an image response as raw bytes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: {
          "content-type": "image/jpeg",
          "X-Mekty-Session": "s-7",
          "X-Page-Url": encodeURIComponent("https://example.com/"),
        },
      }),
    ));

    const response = await browserRpc<Uint8Array>("user-1", "screenshot", { rpcUrl: RPC_URL, sessionId: "s-7" });

    expect(response.sessionId).toBe("s-7");
    expect(response.currentUrl).toBe("https://example.com/");
    expect((response.result as Uint8Array).length).toBe(3);
  });

  it("turns a 410 from the runner into a retryable BrowserRpcError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Session expired or not found", status: 410 }), {
        status: 410,
        headers: { "content-type": "application/json" },
      }),
    ));

    await expect(browserRpc("user-1", "status", { rpcUrl: RPC_URL, sessionId: "gone" }))
      .rejects.toMatchObject({ name: "BrowserRpcError", status: 410 });
  });

  it("retries 502/503 with backoff before giving up", async () => {
    delete process.env.VERCEL;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "warming up", status: 503 }), {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { open: true } }), {
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await browserRpc("user-1", "status", { rpcUrl: RPC_URL });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.result).toEqual({ open: true });
  });
});
