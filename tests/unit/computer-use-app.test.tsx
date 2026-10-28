/**
 * Окно «Работа с компьютером»: остановка, возврат состояния после
 * переоткрытия окна, быстрый старт.
 */

// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ComputerUseApp } from "@/components/workspace/apps/computer-use";

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let handler: Handler;
const calls: Array<{ url: string; method: string }> = [];

const json = (body: unknown, status = 200) => ({
  ok: status < 400, status,
  headers: new Headers({ "content-type": "application/json" }),
  text: async () => JSON.stringify(body),
  json: async () => body,
}) as unknown as Response;

const idle: Handler = (url) => (url.includes("screenshot")
  ? json({ error: "нет" }, 404)
  : json({ running: false, pending: [], events: [] }));

beforeEach(() => {
  calls.length = 0;
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET" });
    return handler(url, init);
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("окно «Работа с компьютером»", () => {
  it("быстрый старт подставляет задачу и адрес", () => {
    handler = idle;
    render(<ComputerUseApp />);
    fireEvent.click(screen.getByRole("button", { name: "BilimClass: провести урок" }));
    expect((screen.getByLabelText(/Задача для агента/) as HTMLTextAreaElement).value).toContain("BilimClass");
    expect((screen.getByLabelText(/Начать с этой страницы/) as HTMLInputElement).value).toContain("bilimclass.kz");
  });

  it("без браузера показывает понятную заглушку вместо пустого места", async () => {
    handler = idle;
    render(<ComputerUseApp />);
    await waitFor(() => expect(screen.getByText(/Браузер ещё не открыт/)).toBeTruthy());
  });

  it("при повторном открытии окна возвращает состояние «работает» и даёт остановить агента", async () => {
    handler = (url, init) => {
      if (url.includes("screenshot")) return json({ error: "нет" }, 404);
      if (init?.method === "DELETE") return json({ ok: true, running: true, stopping: true });
      return json({ running: true, pending: [], events: [{ type: "THINK", message: "Шаг 1" }], control: "ai" });
    };
    render(<ComputerUseApp />);
    const stop = await screen.findByRole("button", { name: /Остановить/ });
    expect(screen.getByText("Шаг 1")).toBeTruthy();

    await act(async () => { fireEvent.click(stop); });
    expect(calls.some((c) => c.method === "DELETE" && c.url === "/api/agents/computer")).toBe(true);
  });

  it("не даёт запустить второго агента, пока первый работает", async () => {
    handler = (url) => (url.includes("screenshot")
      ? json({ error: "нет" }, 404)
      : json({ running: true, pending: [], events: [], control: "ai" }));
    render(<ComputerUseApp />);
    await screen.findByRole("button", { name: /Остановить/ });
    expect((screen.getByRole("button", { name: /Запустить агента/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("показывает число действий, ждущих решения", async () => {
    handler = (url) => {
      if (url.includes("screenshot")) return json({ error: "нет" }, 404);
      return json({
        running: true, control: "ai", events: [],
        pending: [{ id: "1", action: { name: "click", intent: "", args: {} }, decision: { risk: "high", reason: "", policy: "LOGIN" }, probe: { label: "Войти", tag: "button", visible: true } }],
      });
    };
    render(<ComputerUseApp />);
    // Опрос раз в 1,5 с: ждём первое обновление.
    await waitFor(() => expect(screen.getByText(/ждёт решения: 1/)).toBeTruthy(), { timeout: 4000 });
  });
});
