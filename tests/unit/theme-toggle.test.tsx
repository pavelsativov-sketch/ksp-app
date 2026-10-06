// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle, themeScript } from "@/components/i18n/theme-toggle";

const KEY = "mekty:theme";

beforeEach(() => {
  document.documentElement.className = "";
  document.documentElement.style.colorScheme = "";
  window.localStorage.clear();
});

afterEach(() => cleanup());

describe("ThemeToggle", () => {
  it("по умолчанию светлая и переключается в тёмную", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(button);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(KEY)).toBe("dark");
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
  });

  it("переключается обратно в светлую", () => {
    render(<ThemeToggle />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("button"));

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe("light");
  });

  it("уважает сохранённый выбор при монтировании", () => {
    window.localStorage.setItem(KEY, "dark");
    render(<ThemeToggle />);
    // Тема применяется скриптом в <head>, здесь компонент её только читает.
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
  });

  it("имеет доступную подпись в обоих состояниях", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("button").getAttribute("aria-label")).toBeTruthy();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button").getAttribute("aria-label")).toBeTruthy();
  });
});

describe("скрипт до отрисовки", () => {
  // Скрипт ставит класс до первой отрисовки, иначе при перезагрузке
  // страница на мгновение показывается светлой.
  it("читает тему из localStorage и ставит класс dark", () => {
    window.localStorage.setItem(KEY, "dark");
    new Function(themeScript)();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("при явном light не ставит dark", () => {
    window.localStorage.setItem(KEY, "light");
    document.documentElement.classList.add("dark");
    new Function(themeScript)();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("не падает, если localStorage недоступен", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error("blocked"); };
    try {
      expect(() => new Function(themeScript)()).not.toThrow();
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
