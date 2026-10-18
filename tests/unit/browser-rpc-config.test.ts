import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browserRpc, BrowserRpcError } from "@/lib/agents/browser-rpc";

const getSandboxBrowserRpcUrl = vi.fn(async () => RPC_URL);
vi.mock("@/lib/agents/sandbox-browser-service", () => ({ getSandboxBrowserRpcUrl }));

const AUTH_SECRET = "test-secret-that-is-definitely-longer-than-32-chars";
const RPC_URL = "https://sandbox-3000.example.vercel.run/_agent/browser";

/**
 * Браузер ОС живёт в персональной Vercel Sandbox. Раньше адрес можно было
 * ещё и задать переменной `BROWSER_RPC_URL` (остаток от Codespaces), но на
 * Vercel она всё равно не читалась — остался только второй путь, который
 * ничего не включал.
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

  it("resolves the runner url from the Vercel sandbox, not from the environment", async () => {
    process.env.VERCEL = "1";
    // Раньше адрес можно было задать переменной BROWSER_RPC_URL. На Vercel она
    // всё равно не читалась — теперь такой путь не существует вовсе.
    process.env.BROWSER_RPC_URL = "https://obsolete-codespaces-host.example/_agent/browser";

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
    const expected = createHmac("sha256", Buffer.from(AUTH_SECRET))
      .update(`${timestamp}.${rawBody}`)
      .digest("base64url");
    expect(headers["x-mekty-signature"]).toBe(expected);
  });

  it("uses a dedicated runner secret when it is configured", async () => {
    const runnerSecret = "runner-secret-that-is-definitely-longer-than-32-chars";
    process.env.BROWSER_RPC_SECRET = runnerSecret;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { open: true } }), { headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await browserRpc("user-1", "status", { rpcUrl: RPC_URL, sessionId: "s-1" });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    const expected = createHmac("sha256", Buffer.from(runnerSecret))
      .update(`${headers["x-mekty-timestamp"]}.${init.body as string}`)
      .digest("base64url");
    expect(headers["x-mekty-signature"]).toBe(expected);
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
});
