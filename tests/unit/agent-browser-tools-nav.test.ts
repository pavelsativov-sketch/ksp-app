/**
 * Навигационные инструменты агента: прокрутка, служебные клавиши, «назад», ожидание.
 * Без прокрутки агент видел только первый экран, и журналы BilimClass были недоступны.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  wheel: vi.fn(),
  press: vi.fn(),
  goBack: vi.fn(),
  waitForTimeout: vi.fn(),
  url: "https://www.bilimclass.kz/2026/control/journal/groups",
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/providers", () => ({ executeWithFallback: vi.fn() }));
vi.mock("@/lib/agents/permissions", () => ({ requestPermission: vi.fn() }));
vi.mock("@/lib/agents/ssrf", () => ({ checkPublicUrl: vi.fn(), installRequestGuard: vi.fn() }));
vi.mock("@/lib/agents/browser-dom", () => ({
  detectPageAuthBarrier: vi.fn(async () => ({ requiresUserAction: false, kind: null, reason: "" })),
}));
vi.mock("@/lib/agents/computer/screen", () => ({
  SCREEN_WIDTH: 1280,
  SCREEN_HEIGHT: 800,
  denormalize: (v: number) => v,
  probeElement: vi.fn(),
  readInteractables: vi.fn(async () => "[1] кнопка «Журнал»"),
}));
vi.mock("@/lib/agents/browser-session", () => {
  const page = {
    url: () => mock.url,
    title: async () => "Журнал",
    evaluate: async () => "Текст страницы",
    mouse: { wheel: mock.wheel },
    keyboard: { press: mock.press },
    goBack: mock.goBack,
    waitForTimeout: mock.waitForTimeout,
  };
  const session = { page };
  return {
    getAgentBrowserSession: async () => session,
    persistAgentBrowserSession: async () => undefined,
    withBrowserSession: async (_userId: string, run: (s: typeof session) => Promise<unknown>) => run(session),
  };
});

import { browserTools, ALLOWED_KEYS } from "@/lib/agents/tools/browser";

const ctx = { userId: "u1" };

beforeEach(() => vi.clearAllMocks());

describe("browserScroll", () => {
  it("по умолчанию прокручивает вниз на один экран и возвращает обновлённый экран", async () => {
    const result = await browserTools.browserScroll({}, ctx);
    expect(mock.wheel).toHaveBeenCalledWith(0, 700);
    expect(result).toMatchObject({ success: true, scrolled: "down 1", url: mock.url, title: "Журнал" });
    expect((result as { interactables: string }).interactables).toContain("Журнал");
  });

  it.each([
    ["up", 2, [0, -1400]],
    ["right", 1, [700, 0]],
    ["left", 0.5, [-350, 0]],
  ])("направление %s на %s экр.", async (direction, amount, expected) => {
    await browserTools.browserScroll({ direction, amount }, ctx);
    expect(mock.wheel).toHaveBeenCalledWith(...(expected as [number, number]));
  });

  it("ограничивает прокрутку пятью экранами и четвертью экрана снизу", async () => {
    await browserTools.browserScroll({ direction: "down", amount: 100 }, ctx);
    expect(mock.wheel).toHaveBeenLastCalledWith(0, 3500);
    await browserTools.browserScroll({ direction: "down", amount: 0.01 }, ctx);
    expect(mock.wheel).toHaveBeenLastCalledWith(0, 175);
  });

  it("неизвестное направление считается «вниз»", async () => {
    await browserTools.browserScroll({ direction: "куда-то" }, ctx);
    expect(mock.wheel).toHaveBeenCalledWith(0, 700);
  });

  it("требует пользовательскую сессию", async () => {
    expect(await browserTools.browserScroll({}, {})).toMatchObject({ success: false });
    expect(mock.wheel).not.toHaveBeenCalled();
  });
});

describe("browserPressKey", () => {
  it.each([["Escape", "Escape"], ["esc", "Escape"], ["PAGEDOWN", "PageDown"], ["arrowleft", "ArrowLeft"], ["Tab", "Tab"]])(
    "клавиша %s нажимается как %s",
    async (key, expected) => {
      const result = await browserTools.browserPressKey({ key }, ctx);
      expect(mock.press).toHaveBeenCalledWith(expected);
      expect(result).toMatchObject({ success: true, pressed: expected });
    },
  );

  it.each(["Enter", "Delete", "Backspace", "Control+A", "F5", "", "a"])("клавиша «%s» не разрешена: она могла бы отправить форму или стереть данные", async (key) => {
    const result = await browserTools.browserPressKey({ key }, ctx);
    expect(result).toMatchObject({ success: false });
    expect(mock.press).not.toHaveBeenCalled();
  });

  it("разрешённые клавиши не содержат Enter и Delete", () => {
    expect([...ALLOWED_KEYS.values()]).not.toContain("Enter");
    expect([...ALLOWED_KEYS.values()]).not.toContain("Delete");
  });
});

describe("browserGoBack и browserWait", () => {
  it("возвращается назад и показывает экран", async () => {
    expect(await browserTools.browserGoBack({}, ctx)).toMatchObject({ success: true, url: mock.url });
    expect(mock.goBack).toHaveBeenCalledTimes(1);
  });

  it("ждёт от 1 до 10 секунд", async () => {
    await browserTools.browserWait({ seconds: 3 }, ctx);
    expect(mock.waitForTimeout).toHaveBeenLastCalledWith(3000);
    await browserTools.browserWait({ seconds: 999 }, ctx);
    expect(mock.waitForTimeout).toHaveBeenLastCalledWith(10000);
    await browserTools.browserWait({ seconds: -5 }, ctx);
    expect(mock.waitForTimeout).toHaveBeenLastCalledWith(1000);
    await browserTools.browserWait({}, ctx);
    expect(mock.waitForTimeout).toHaveBeenLastCalledWith(2000);
  });

  it("ошибка страницы возвращается как результат, а не исключение", async () => {
    mock.goBack.mockRejectedValueOnce(new Error("нет истории"));
    expect(await browserTools.browserGoBack({}, ctx)).toMatchObject({ success: false, error: "нет истории" });
  });
});
