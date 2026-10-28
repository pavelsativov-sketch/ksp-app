/**
 * Панель окон встроенной рабочей области: свёрнутое окно нельзя потерять.
 * Раньше в двухпанельной раскладке дока не было совсем, и вернуть свёрнутое
 * окно можно было только повторным кликом по иконке, часто скрытой под другим окном.
 */

// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/workspace/apps/iframe", () => ({ IframeApp: () => <div data-testid="iframe-app" /> }));

import { WorkspaceSurface } from "@/components/workspace/workspace";
import { useWorkspaceStore } from "@/lib/store/workspace";

beforeEach(() => {
  useWorkspaceStore.setState({ windows: [], activeWindowId: null });
  window.localStorage.clear();
});

afterEach(cleanup);

function openTwo() {
  act(() => {
    const store = useWorkspaceStore.getState();
    store.openWindow("a", "Аналитика", "iframe", "/school/dashboard");
    store.openWindow("b", "Конструктор", "iframe", "/plans/new");
  });
}

describe("панель окон", () => {
  it("не показывается, пока нет открытых окон", () => {
    render(<WorkspaceSurface />);
    expect(screen.queryByRole("toolbar", { name: "Открытые окна" })).toBeNull();
  });

  it("перечисляет открытые окна", () => {
    openTwo();
    render(<WorkspaceSurface />);
    const tray = screen.getByRole("toolbar", { name: "Открытые окна" });
    expect(tray.textContent).toContain("Аналитика");
    expect(tray.textContent).toContain("Конструктор");
  });

  it("свёрнутое окно возвращается кликом по панели", () => {
    openTwo();
    act(() => useWorkspaceStore.getState().minimizeWindow("a"));
    render(<WorkspaceSurface />);
    fireEvent.click(screen.getByRole("button", { name: /Окно «Аналитика», свёрнуто/ }));
    const win = useWorkspaceStore.getState().windows.find((w) => w.id === "a");
    expect(win?.isMinimized).toBe(false);
    expect(useWorkspaceStore.getState().activeWindowId).toBe("a");
  });

  it("клик по активному окну сворачивает его", () => {
    openTwo();
    render(<WorkspaceSurface />);
    fireEvent.click(screen.getByRole("button", { name: /Окно «Конструктор»/ }));
    expect(useWorkspaceStore.getState().windows.find((w) => w.id === "b")?.isMinimized).toBe(true);
  });

  it("«Показать рабочий стол» сворачивает все окна", () => {
    openTwo();
    render(<WorkspaceSurface />);
    fireEvent.click(screen.getByRole("button", { name: "Показать рабочий стол" }));
    expect(useWorkspaceStore.getState().windows.every((w) => w.isMinimized)).toBe(true);
  });

  it("в полноэкранной раскладке (есть Taskbar) панель окон не дублируется", () => {
    openTwo();
    render(<WorkspaceSurface showTray={false} />);
    expect(screen.queryByRole("toolbar", { name: "Открытые окна" })).toBeNull();
  });
});
