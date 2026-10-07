// @vitest-environment jsdom
import * as React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SchoolWorkspace } from "@/components/school/school-workspace";

/**
 * Экран раздела «Школа» — два панно: слева окно запроса агенту, справа
 * рабочая область ОС. Тест фиксирует саму раскладку: без неё страница
 * незаметно скатывается обратно к одному столбцу с плавающим окном поверх.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/school",
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

it("renders a request pane and an OS workspace pane together", () => {
  render(<SchoolWorkspace />);

  // Слева — чат с агентом, справа — рабочая область ОС.
  const requestPane = screen.getByRole("region", { name: "Чат с агентом" });
  const osPane = screen.getByRole("region", { name: "Рабочая область ОС" });
  expect(requestPane).toBeTruthy();
  expect(osPane).toBeTruthy();

  // Слева — поле для описания задачи и примеры запросов.
  expect(screen.getByLabelText(/Опишите задачу/i)).toBeTruthy();
  expect(screen.getByRole("button", { name: /Запустить агента/i })).toBeTruthy();

  // Справа — ОС: вкладки приложений открывают их на всю панель.
  //
  // Ищем именно во вкладках: те же приложения есть и в доке панели задач, и
  // после перевода дока на русский имена («Браузер», «Терминал») совпали с
  // названиями вкладок — поиск по имени находил сразу два элемента.
  const osTabs = within(osPane).getByRole("tablist");
  for (const label of ["ОС", "Браузер", "Файлы", "Терминал"]) {
    expect(within(osTabs).getByRole("tab", { name: label })).toBeTruthy();
  }

  // Статус-бар с системной строкой и индикатором работы.
  expect(within(osPane).getByText(/Ожидание|Работает/)).toBeTruthy();

  // До запуска задачи показан пустой ход выполнения, а не «висящий» спиннер.
  expect(screen.getByText(/Здесь появится план и пошаговый ход работы/i)).toBeTruthy();
});