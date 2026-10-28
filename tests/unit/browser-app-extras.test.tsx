/**
 * Приложение «Браузер»: прокрутка колесом, диалог сохранения пароля,
 * понятное сообщение при недоступном браузере.
 */

// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BrowserApp } from "@/components/workspace/apps/browser";

const posts: Array<Record<string, string>> = [];

function frameResponse() {
  return new Response(new Blob(["x"], { type: "image/jpeg" }), {
    status: 200,
    headers: new Headers({
      "Content-Type": "image/jpeg",
      "X-Page-Title": encodeURIComponent("Пример"),
      "X-Page-Url": encodeURIComponent("https://www.example.com/"),
    }),
  });
}

beforeEach(() => {
  posts.length = 0;
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:mock"), revokeObjectURL: vi.fn() }));
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("browser-keepalive")) return new Response("{}", { status: 200 });
    if (init?.method === "POST") posts.push(JSON.parse(String(init.body)));
    return frameResponse();
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("прокрутка колесом", () => {
  it("копит несколько тиков в один запрос и отменяет прокрутку страницы вокруг", async () => {
    render(<BrowserApp initialUrl="https://www.example.com/" />);
    const img = await screen.findByAltText("Экран браузера");
    posts.length = 0;

    const first = new WheelEvent("wheel", { deltaY: 100, cancelable: true, bubbles: true });
    act(() => { img.dispatchEvent(first); });
    act(() => { img.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, cancelable: true, bubbles: true })); });
    act(() => { img.dispatchEvent(new WheelEvent("wheel", { deltaY: 50, cancelable: true, bubbles: true })); });

    // Обработчик не пассивный: страница вокруг не должна прокручиваться.
    expect(first.defaultPrevented).toBe(true);

    await waitFor(() => expect(posts.filter((p) => p.action === "scroll")).toHaveLength(1));
    expect(posts.find((p) => p.action === "scroll")).toEqual({ action: "scroll", dy: "250" });
  });
});

describe("клавиши навигации", () => {
  it("PageDown и Home отправляются в удалённый браузер", async () => {
    render(<BrowserApp initialUrl="https://www.example.com/" />);
    await screen.findByAltText("Экран браузера");
    const kb = screen.getByLabelText("Прямой ввод с клавиатуры в рабочую область браузера");
    posts.length = 0;
    await act(async () => { fireEvent.keyDown(kb, { key: "PageDown" }); });
    await act(async () => { fireEvent.keyDown(kb, { key: "Home" }); });
    await waitFor(() => expect(posts.filter((p) => p.action === "key").map((p) => p.key)).toEqual(["PageDown", "Home"]));
  });
});

describe("диалог сохранения пароля", () => {
  it("открывается как диалог, закрывается по Escape, показывает домен без www", async () => {
    render(<BrowserApp initialUrl="https://www.example.com/" />);
    await screen.findByAltText("Экран браузера");
    fireEvent.click(screen.getByRole("button", { name: /Пароль/ }));

    const dialog = screen.getByRole("dialog", { name: /авто-вход/i });
    expect(dialog.textContent).toContain("example.com");
    expect(dialog.textContent).not.toContain("www.example.com");

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("если сервер отказал, говорит об этом, а не молчит", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("browser-credentials")) {
        return new Response(JSON.stringify({ error: "Слишком много попыток" }), { status: 429, headers: { "Content-Type": "application/json" } });
      }
      if (String(input).includes("browser-keepalive")) return new Response("{}", { status: 200 });
      void init;
      return frameResponse();
    }));
    render(<BrowserApp initialUrl="https://www.example.com/" />);
    await screen.findByAltText("Экран браузера");
    fireEvent.click(screen.getByRole("button", { name: /Пароль/ }));
    fireEvent.change(screen.getByLabelText("Логин"), { target: { value: "teacher" } });
    fireEvent.change(screen.getByLabelText("Пароль", { selector: "input" }), { target: { value: "secret-pass" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Сохранить/ })); });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Слишком много попыток"));
  });
});
