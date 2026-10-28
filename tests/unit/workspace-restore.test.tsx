/**
 * Окна, сохранённые в браузере, возвращаются свёрнутыми, но окно, открытое
 * глубокой ссылкой сразу после монтирования, остаётся открытым.
 *
 * Отдельный файл: признак «уже восстановили» живёт в модуле на одну загрузку
 * страницы, поэтому каждому сценарию нужен свежий модуль.
 */

// @vitest-environment jsdom
import * as React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/components/workspace/apps/iframe", () => ({ IframeApp: () => <div /> }));

import { WorkspaceSurface } from "@/components/workspace/workspace";
import { useWorkspaceStore } from "@/lib/store/workspace";

afterEach(cleanup);

it("сохранённые окна сворачиваются, а открытое после монтирования — нет", () => {
  window.localStorage.setItem("mekty.workspace.windows", JSON.stringify({
    state: {
      windows: [{ id: "old", title: "Старое", type: "iframe", url: "/x", isOpen: true, isMinimized: false, isMaximized: false, zIndex: 1 }],
      activeWindowId: "old",
    },
    version: 3,
  }));

  // Родитель открывает окно по ссылке в своём эффекте — после эффекта поверхности.
  function Parent() {
    React.useEffect(() => {
      useWorkspaceStore.getState().openWindow("computer-use", "Работа с компьютером", "iframe", "/y");
    }, []);
    return <WorkspaceSurface />;
  }
  render(<Parent />);

  const windows = useWorkspaceStore.getState().windows;
  expect(windows.find((w) => w.id === "old")?.isMinimized).toBe(true);
  expect(windows.find((w) => w.id === "computer-use")?.isMinimized).toBe(false);
  expect(useWorkspaceStore.getState().activeWindowId).toBe("computer-use");
});
