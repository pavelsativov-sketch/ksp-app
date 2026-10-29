/**
 * Самовосстановление браузерной сессии.
 *
 * Боевой тест: песочница «уснула», раннер отвечал 410 «Session expired or not
 * found», а приложение держало мёртвую сессию в кэше, и каждый шаг агента падал
 * одинаково. Теперь 410 сбрасывает сессию, а действие повторяется на новой.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  browserRpc: vi.fn(),
  createBrowserRpcSession: vi.fn(),
  rpcUrl: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/mongo", () => ({
  COL: { agentBrowserSessions: "agent_browser_sessions" },
  getDb: async () => ({
    collection: () => ({
      findOne: async () => null,
      updateOne: async () => ({}),
      deleteOne: async () => ({}),
    }),
  }),
}));
vi.mock("@/lib/agents/runtime-mode", () => ({ getBrowserTarget: () => "vercel-sandbox" }));
vi.mock("@/lib/agents/sandbox-browser-service", () => ({ getSandboxBrowserRpcUrl: mock.rpcUrl }));
vi.mock("@/lib/agents/browser-rpc", async () => {
  class BrowserRpcError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
      this.name = "BrowserRpcError";
    }
  }
  return { BrowserRpcError, browserRpc: mock.browserRpc, createBrowserRpcSession: mock.createBrowserRpcSession };
});

import { BrowserRpcError } from "@/lib/agents/browser-rpc";
import { getAgentBrowserSession, isSessionGone, withBrowserSession } from "@/lib/agents/browser-session";

const gone = () => new BrowserRpcError("Session expired or not found", 410);

describe("isSessionGone", () => {
  it("узнаёт 410 и текст раннера", () => {
    expect(isSessionGone(gone())).toBe(true);
    expect(isSessionGone(new Error("Session expired or not found"))).toBe(true);
    expect(isSessionGone(new Error("Сеанс браузера завершён"))).toBe(true);
  });

  it("не принимает за мёртвую сессию остальные ошибки", () => {
    expect(isSessionGone(new BrowserRpcError("Слишком много обращений", 429))).toBe(false);
    expect(isSessionGone(new BrowserRpcError("падение", 502))).toBe(false);
    expect(isSessionGone(new Error("navigation timeout"))).toBe(false);
    expect(isSessionGone(null)).toBe(false);
  });
});

describe("withBrowserSession", () => {
  const fakeSession = (name: string) => ({ name }) as never;

  it("при удаче не делает повторов", async () => {
    const getSession = vi.fn().mockResolvedValue(fakeSession("a"));
    const run = vi.fn().mockResolvedValue("готово");
    expect(await withBrowserSession("u1", run, getSession)).toBe("готово");
    expect(run).toHaveBeenCalledTimes(1);
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it("если сеанс умер, повторяет действие один раз на свежей сессии", async () => {
    const getSession = vi.fn().mockResolvedValueOnce(fakeSession("старая")).mockResolvedValueOnce(fakeSession("новая"));
    const run = vi.fn().mockRejectedValueOnce(gone()).mockImplementationOnce(async (session: { name: string }) => `ok:${session.name}`);
    expect(await withBrowserSession("u1", run, getSession)).toBe("ok:новая");
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it("не зацикливается: второй провал пробрасывается", async () => {
    const getSession = vi.fn().mockResolvedValue(fakeSession("a"));
    const run = vi.fn().mockRejectedValue(gone());
    await expect(withBrowserSession("u1", run, getSession)).rejects.toMatchObject({ status: 410 });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("другие ошибки не повторяются", async () => {
    const getSession = vi.fn().mockResolvedValue(fakeSession("a"));
    const run = vi.fn().mockRejectedValue(new Error("сайт недоступен"));
    await expect(withBrowserSession("u1", run, getSession)).rejects.toThrow("сайт недоступен");
    expect(run).toHaveBeenCalledTimes(1);
    expect(getSession).toHaveBeenCalledTimes(1);
  });
});

describe("кэш сессии после 410", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.rpcUrl.mockResolvedValue("https://sandbox.example/_agent/browser");
  });

  it("мёртвая сессия сбрасывается сразу, и следующий запрос получает новую", async () => {
    mock.createBrowserRpcSession
      .mockResolvedValueOnce({ sessionId: "s1", currentUrl: "about:blank" })
      .mockResolvedValueOnce({ sessionId: "s2", currentUrl: "about:blank" });

    const first = await getAgentBrowserSession("recover-user");
    // Раннер забыл сеанс: любое действие получает 410.
    mock.browserRpc.mockRejectedValueOnce(gone());
    await expect(first.page.goto("https://example.com", { timeout: 5000 })).rejects.toMatchObject({ status: 410 });
    expect(first.browser.isConnected()).toBe(false);

    // Не через 15 секунд, а сразу: кэш уже не отдаёт мёртвую сессию.
    const second = await getAgentBrowserSession("recover-user");
    expect(second).not.toBe(first);
    expect(mock.createBrowserRpcSession).toHaveBeenCalledTimes(2);
    expect(second.browser.isConnected()).toBe(true);
  });
});
