// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentComposer } from "@/components/agents/agent-composer";

/**
 * Композер задач агента.
 *
 * Главный регресс здесь — блокировка композера после ответа сервера:
 * run() ставит pending, а снимает его не на всех путях выхода (сессия
 * учителя истекла, сервер ответил 401 и до setPending(false) дело не
 * дошло). После этого поле и кнопка оставались заблокированы навсегда,
 * хотя учитель успел заново войти в систему.
 */

const push = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

type FetchAnswer = { json: unknown; status: number };

const calls: string[] = [];
let sequence: FetchAnswer[] = [];

function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  calls.push(String(input));
  const answer = sequence.shift();
  return Promise.resolve(
    new Response(JSON.stringify(answer?.json ?? {}), { status: answer?.status ?? 500 }),
  );
}

beforeEach(() => {
  calls.length = 0;
  sequence = [];
  push.mockReset();
  vi.stubGlobal("fetch", vi.fn(fakeFetch as typeof fetch));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

/** Ввод задачи через поле с подписью, а не через id: так тест не хрупче UI. */
function typeTask(task: string) {
  fireEvent.change(screen.getByLabelText(/Опишите задачу/i), { target: { value: task } });
}

function fieldValue(el: HTMLElement) {
  return (el as HTMLTextAreaElement).value;
}

it("запускает задачу и очищает поле после успеха", async () => {
  sequence = [{ json: { taskId: "t1" }, status: 201 }];

  render(<AgentComposer />);
  typeTask("Составь анализ СОР №1");
  fireEvent.click(screen.getByRole("button", { name: /Запустить агента/i }));

  await waitFor(() => expect(calls).toEqual(["/api/agents/task"]));
  await waitFor(() => expect(fieldValue(screen.getByLabelText(/Опишите задачу/i))).toBe(""));
});

it("после 401 композер остаётся рабочим и запускает новую задачу", async () => {
  // Первая попытка: сессия истекла, сервер вернул 401.
  sequence = [
    { json: {}, status: 401 },
    { json: { taskId: "t2" }, status: 201 },
  ];

  render(<AgentComposer />);
  typeTask("Открой дэшборд и отметь урок");
  fireEvent.click(screen.getByRole("button", { name: /Запустить агента/i }));
  await waitFor(() => expect(calls).toHaveLength(1));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/login?next=/school/workspace"));

  // Учитель снова вошёл, а компонент не перемонтировался: run() до правки
  // вылетал раньше setPending(false), и вторая задача молча не запускалась.
  typeTask("Составь психолого-педагогическую характеристику");
  fireEvent.click(screen.getByRole("button", { name: /Запустить агента/i }));
  await waitFor(() => expect(calls).toHaveLength(2));
  await waitFor(() => expect(fieldValue(screen.getByLabelText(/Опишите задачу/i))).toBe(""));
});

it("короткий текст задачу не отправляет и держит кнопку выключенной", () => {
  render(<AgentComposer />);
  // Порог запуска — три символа: два ещё слишком коротки для задачи.
  typeTask("Но");
  expect(
    (screen.getByRole("button", { name: /Запустить агента/i }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(calls).toHaveLength(0);
});

it("кнопка запуска срабатывает по Ctrl+Enter, но не по Enter без Ctrl", async () => {
  sequence = [{ json: { taskId: "t3" }, status: 201 }];

  render(<AgentComposer />);
  const field = screen.getByLabelText(/Опишите задачу/i);
  fireEvent.change(field, { target: { value: "Проверь поурочный план по физике" } });
  fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
  await waitFor(() => expect(calls).toEqual(["/api/agents/task"]));

  calls.length = 0;
  typeTask("Новое описание задачи");
  fireEvent.keyDown(field, { key: "Enter" });
  await act(async () => { await Promise.resolve(); });
  expect(calls).toHaveLength(0);
});

it("показывает ошибку сервера и оставляет композер рабочим", async () => {
  sequence = [
    { json: { error: "Нет свободных исполнителей" }, status: 503 },
    { json: { taskId: "t4" }, status: 201 },
  ];

  render(<AgentComposer />);
  typeTask("Составь отчёт по посещённому уроку");
  fireEvent.click(screen.getByRole("button", { name: /Запустить агента/i }));

  expect(await screen.findByText("Нет свободных исполнителей")).toBeTruthy();

  // После ошибки композер доступен для повторной попытки.
  typeTask("Составь анализ СОР №2");
  fireEvent.click(screen.getByRole("button", { name: /Запустить агента/i }));
  await waitFor(() => expect(calls).toHaveLength(2));
  await waitFor(() => expect(fieldValue(screen.getByLabelText(/Опишите задачу/i))).toBe(""));
});
