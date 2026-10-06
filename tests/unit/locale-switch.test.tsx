// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { PlanSidebar, type SidebarSection } from "@/components/ksp/plan-sidebar";

/**
 * Переключение языка не должно перезагружать страницу: локаль живёт в
 * React-состоянии, поэтому клиентские компоненты перерисовываются сразу.
 * Этот тест фиксирует именно этот контракт — раньше для смены языка делался
 * `window.location.assign`, и мгновенного переключения не было.
 */

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const sections: SidebarSection[] = [
  { id: "meta", label: "Метаданные", completed: true, active: true },
  { id: "goals", label: "Цели", completed: false, active: false },
];

function renderEditor() {
  return render(
    <LocaleProvider initialLocale="ru">
      <LocaleSwitcher locale="ru" />
      <PlanSidebar
        sections={sections}
        onSectionClick={() => {}}
        progress={{ percent: 40, done: 6, total: 15 }}
      />
    </LocaleProvider>,
  );
}

beforeEach(() => {
  refresh.mockClear();
  document.documentElement.lang = "ru";
  document.cookie = "locale=ru; path=/";
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("renders the editor chrome in the locale passed by the server", () => {
  renderEditor();
  expect(screen.getByRole("navigation", { name: "Разделы формы" })).toBeTruthy();
  expect(screen.getByText("Разделы")).toBeTruthy();
  expect(screen.getByText("6 из 15 заполнено")).toBeTruthy();
});

it("switches every client label instantly, without reloading the document", () => {
  const locationAssign = vi.fn();
  const originalLocation = window.location;
  // Полная перезагрузка в этом тесте означала бы вызов location.assign.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, assign: locationAssign, href: "http://localhost/plans/new" },
  });

  renderEditor();

  fireEvent.click(screen.getByRole("button", { name: "Қазақ тіліне ауысу" }));

  // Клиентские компоненты перерисовались в том же кадре.
  expect(screen.getByRole("navigation", { name: "Форма бөлімдері" })).toBeTruthy();
  expect(screen.getByText("Бөлімдер")).toBeTruthy();
  expect(screen.getByText("Орындалуы")).toBeTruthy();
  expect(screen.getByText("15-ден 6 толтырылды")).toBeTruthy();
  // Русских подписей не осталось.
  expect(screen.queryByText("Разделы")).toBeNull();

  // Страница не перезагружалась, язык документа и cookie обновились.
  expect(locationAssign).not.toHaveBeenCalled();
  expect(document.documentElement.lang).toBe("kk");
  expect(document.cookie).toContain("locale=kk");
  // Серверные компоненты обновляются мягко, через router.refresh.
  expect(refresh).toHaveBeenCalledTimes(1);

  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

it("ignores a click on the language that is already active", () => {
  renderEditor();
  fireEvent.click(screen.getByRole("button", { name: "Переключить на русский" }));
  expect(refresh).not.toHaveBeenCalled();
  expect(screen.getByText("Разделы")).toBeTruthy();
});