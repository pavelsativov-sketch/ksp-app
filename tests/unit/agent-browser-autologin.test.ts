/** Агент не вводит пароль сам: страница входа BilimClass обрабатывается системой. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  login: vi.fn(),
  barrier: vi.fn(),
  url: "https://www.bilimclass.kz/login",
  text: "",
  visited: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/providers", () => ({ executeWithFallback: vi.fn() }));
vi.mock("@/lib/agents/permissions", () => ({ requestPermission: vi.fn() }));
vi.mock("@/lib/agents/ssrf", () => ({
  checkPublicUrl: vi.fn(async (url: string) => ({ ok: true, url: new URL(url) })),
  installRequestGuard: vi.fn(),
}));
vi.mock("@/lib/agents/browser-dom", () => ({ detectPageAuthBarrier: mock.barrier }));
vi.mock("@/lib/agents/browser-autologin", () => ({
  knownLoginSite: (url: string) => (url.includes("bilimclass.kz") ? { domain: "bilimclass.kz", name: "BilimClass" } : null),
  looksLoggedOut: (text: string) => text.includes("Кіру"),
  loginWithSavedCredentials: mock.login,
}));
vi.mock("@/lib/agents/computer/screen", () => ({
  SCREEN_WIDTH: 1280,
  SCREEN_HEIGHT: 800,
  denormalize: (v: number) => v,
  probeElement: vi.fn(),
  readInteractables: vi.fn(async () => ""),
}));
vi.mock("@/lib/agents/browser-session", () => {
  const page = {
    url: () => mock.url,
    title: async () => "Вход",
    evaluate: async () => mock.text,
    goto: async (url: string) => {
      mock.url = url;
      mock.visited.push(url);
      if (url.endsWith("/login")) mock.text = "Форма";
    },
    mouse: { wheel: vi.fn() },
    keyboard: { press: vi.fn() },
    waitForTimeout: vi.fn(),
  };
  const session = { page };
  return {
    getAgentBrowserSession: async () => session,
    persistAgentBrowserSession: async () => undefined,
    withBrowserSession: async (_u: string, run: (s: typeof session) => Promise<unknown>) => run(session),
  };
});

import { browserTools } from "@/lib/agents/tools/browser";

const loginBarrier = { requiresUserAction: true, kind: "login", reason: "форма входа" };
const noBarrier = { requiresUserAction: false, kind: null, reason: "" };

beforeEach(() => {
  vi.clearAllMocks();
  mock.url = "https://www.bilimclass.kz/login";
  mock.text = "";
  mock.visited = [];
});

describe("автовход в инструментах браузера", () => {
  it("после успешного входа возвращает новый экран и пометку autoLogin без пароля", async () => {
    mock.barrier.mockResolvedValueOnce(loginBarrier).mockResolvedValue(noBarrier);
    mock.login.mockResolvedValue({ status: "logged-in", domain: "bilimclass.kz", name: "BilimClass" });
    const result = (await browserTools.browserWait({ seconds: 1 }, { userId: "u1" })) as Record<string, unknown>;
    expect(result.success).toBe(true);
    expect(String(result.autoLogin)).toContain("BilimClass");
    expect((result.authBarrier as { requiresUserAction: boolean }).requiresUserAction).toBe(false);
  });

  it("без сохранённых данных просит окно ввода и запрещает агенту вводить пароль", async () => {
    mock.barrier.mockResolvedValue(loginBarrier);
    mock.login.mockResolvedValue({ status: "no-credentials", domain: "bilimclass.kz", name: "BilimClass" });
    const result = (await browserTools.browserWait({ seconds: 1 }, { userId: "u1" })) as { needsCredentials?: unknown; authBarrier: { reason: string } };
    expect(result.needsCredentials).toMatchObject({ domain: "bilimclass.kz" });
    expect(result.authBarrier.reason).toContain("Не пытайся вводить");
  });

  it("на странице без формы входа автовход не вызывается", async () => {
    mock.barrier.mockResolvedValue(noBarrier);
    await browserTools.browserWait({ seconds: 1 }, { userId: "u1" });
    expect(mock.login).not.toHaveBeenCalled();
  });

  it("на чужом сайте автовход не вызывается", async () => {
    mock.url = "https://evil.example/login";
    mock.barrier.mockResolvedValue(loginBarrier);
    await browserTools.browserWait({ seconds: 1 }, { userId: "u1" });
    expect(mock.login).not.toHaveBeenCalled();
  });

  it("с гостевой страницы сам идёт на вход, входит и возвращается на нужный адрес", async () => {
    const journal = "https://www.bilimclass.kz/2026/control/journal/groups";
    mock.barrier.mockImplementation(async () => (mock.url.endsWith("/login") ? loginBarrier : noBarrier));
    mock.login.mockResolvedValue({ status: "logged-in", domain: "bilimclass.kz", name: "BilimClass" });
    mock.url = journal;
    mock.text = "Қазақша\nКіру";
    // Первый goto открывает журнал и оставляет гостевую страницу.
    mock.visited = [];
    const result = (await browserTools.browserNavigate({ url: journal }, { userId: "u1" })) as Record<string, unknown>;
    expect(mock.visited).toEqual([journal, "https://www.bilimclass.kz/login", journal]);
    expect(String(result.autoLogin)).toContain("BilimClass");
    expect(result.url).toBe(journal);
  });

  it("без сохранённых данных останавливается на входе и просит окно ввода", async () => {
    const journal = "https://www.bilimclass.kz/2026/control/journal/groups";
    mock.barrier.mockImplementation(async () => (mock.url.endsWith("/login") ? loginBarrier : noBarrier));
    mock.login.mockResolvedValue({ status: "no-credentials", domain: "bilimclass.kz", name: "BilimClass" });
    mock.url = journal;
    mock.text = "Қазақша\nКіру";
    const result = (await browserTools.browserNavigate({ url: journal }, { userId: "u1" })) as { needsCredentials?: unknown; url?: string };
    expect(result.needsCredentials).toMatchObject({ domain: "bilimclass.kz" });
    expect(result.url).toContain("/login");
  });

  it("на странице кабинета сообщает модели, что вход уже выполнен", async () => {
    const journal = "https://www.bilimclass.kz/2026/control/journal/groups";
    mock.barrier.mockResolvedValue(noBarrier);
    mock.url = journal;
    mock.text = "Мұғалімге\nМониторинг";
    const result = (await browserTools.browserNavigate({ url: journal }, { userId: "u1" })) as { signedIn?: boolean };
    expect(result.signedIn).toBe(true);
    expect(mock.login).not.toHaveBeenCalled();
  });
});
