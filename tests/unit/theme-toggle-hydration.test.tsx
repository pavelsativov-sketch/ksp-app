// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { ThemeToggle } from "@/components/i18n/theme-toggle";

/**
 * Гидрационная безопасность переключателя темы.
 *
 * Одним из источников страниц ошибок "Minified React error #418" была
 * прежняя схема ThemeToggle: состояние темы считалось в рендере и менялось
 * внутри того же прохода, поэтому тёмный клиент уже в гидрационном проходе
 * рисовал Sun, пока сервер отрендерил Moon — структура разметки расходилась
 * и React переписывал весь SSR DOM (recovery).
 *
 * Правильная схема (текущая): useSyncExternalStore. Первый (гидрационный)
 * рендер всегда берёт серверное значение "light", разметка совпадает
 * побитово, а реальная тема подтягивается штатным обновлением после
 * гидрации.
 */

const STORAGE_KEY = "mekty:theme";

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(STORAGE_KEY);
  document.documentElement.classList.remove("dark");
});

// React 19 требует явного флага для act() вне testing-library-рендера.
beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("ThemeToggle", () => {
  it("серверная разметка не зависит от локальных настроек (нет гидрационного рассинхрона)", () => {
    // Даже при тёмных настройках, сохранённых в localStorage, сервер рендерит
    // одинаковую разметку: Moon + aria-pressed="false". Тёмная тема до
    // гидрации применяется классом .dark на <html> (themeScript), а не
    // содержимым кнопки.
    window.localStorage.setItem(STORAGE_KEY, "dark");

    const markup = renderToStaticMarkup(<ThemeToggle />);

    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain("lucide-moon");
    expect(markup).not.toContain("lucide-sun");
    expect(markup).not.toContain('aria-pressed="true"');
  });

  it("гидрация с тёмным localStorage не роняет совпадение разметки", async () => {
    window.localStorage.setItem(STORAGE_KEY, "dark");
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<ThemeToggle />);
    document.body.appendChild(container);

    const errors: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args);
    });

    await act(async () => {
      hydrateRoot(container, <ThemeToggle />);
    });

    // Никаких гидрационных предупреждений React не должно быть.
    expect(
      errors.filter((a) =>
        String(a).match(/hydrat|did not match|server rendered/i),
      ),
    ).toEqual([]);

    // После гидрации хранилище отдаёт "dark": кнопка штатно перерисовывается.
    const pressed = container.querySelector("button[aria-pressed]");
    expect(pressed?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector(".lucide-sun")).toBeTruthy();
    expect(container.querySelector(".lucide-moon")).toBeFalsy();

    spy.mockRestore();
    container.remove();
  });

  it("клик переключает класс .dark на <html> и сохраняет выбор", async () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<ThemeToggle />);
    document.body.appendChild(container);
    // aria-hidden в SSR от lucide не критичен для клика по кнопке.
    const button = container.querySelector("button");
    expect(button).toBeTruthy();

    const errors: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args);
    });

    await act(async () => {
      hydrateRoot(container, <ThemeToggle />);
    });
    const state = () => `pressed=${button?.getAttribute("aria-pressed")} dark=${document.documentElement.classList.contains("dark")} ls=${window.localStorage.getItem(STORAGE_KEY)}`;
    await act(async () => {
      button!.click();
    });
    expect(state() + " (после клика 1)").toContain("pressed=true");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("dark");
    // Обратное переключение снимает класс симметрично (см. themeScript).
    await act(async () => {
      button!.click();
    });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("light");

    expect(errors).toEqual([]);
    spy.mockRestore();
    container.remove();
  });
});
