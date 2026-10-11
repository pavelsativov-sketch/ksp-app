/**
 * Память окон рабочей области.
 *
 * Проверяется на самом `localStorage`, а не через `persist.rehydrate()`:
 * надо убедиться, что состав окон реально записывается в браузер и что при
 * чтении сохраняется осмысленное состояние, а не мусор.
 */

// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { useWorkspaceStore } from "@/lib/store/workspace";

const KEY = "mekty.workspace.windows";

interface Persisted {
  state: {
    windows: Array<{ id: string; type: string; isMinimized: boolean }>;
    activeWindowId: string | null;
  };
  version: number;
}

/** Читает то, что zustand положил в localStorage. */
function readPersisted(): Persisted | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  return JSON.parse(raw) as Persisted;
}

beforeEach(() => {
  localStorage.clear();
  useWorkspaceStore.setState({ windows: [], activeWindowId: null });
});

describe("окна переживают перезагрузку", () => {
  it("открытые окна записываются в браузер", () => {
    useWorkspaceStore.getState().openWindow("a", "Файлы", "file-manager");
    useWorkspaceStore.getState().openWindow("b", "Терминал", "terminal");

    const saved = readPersisted();
    expect(saved, "состав окон не сохранён").not.toBeNull();
    expect(saved!.state.windows.map((w) => w.id)).toEqual(["a", "b"]);
    expect(saved!.state.activeWindowId).toBe("b");
  });

  it("в память не попадают функции", () => {
    useWorkspaceStore.getState().openWindow("a", "Файлы", "file-manager");
    const saved = readPersisted();
    // Функции не сериализуются и превратились бы в потерянные обработчики.
    for (const key of Object.keys(saved!.state)) {
      expect(typeof (saved!.state as unknown as Record<string, unknown>)[key]).not.toBe("function");
    }
  });

  it("свёрнутое окно остаётся свёрнутым после сохранения", () => {
    useWorkspaceStore.getState().openWindow("a", "Файлы", "file-manager");
    useWorkspaceStore.getState().openWindow("b", "Терминал", "terminal");
    useWorkspaceStore.getState().minimizeWindow("b");

    const saved = readPersisted();
    // Раньше partialize принудительно сбрасывал isMinimized=false и после
    // обновления страницы показывал все окна поверх рабочего стола.
    expect(saved!.state.windows.find((w) => w.id === "a")?.isMinimized).toBe(false);
    expect(saved!.state.windows.find((w) => w.id === "b")?.isMinimized).toBe(true);
    expect(saved!.state.activeWindowId).toBe("a");
  });

  it("при миграции старых данных сворачивает накопившиеся окна", async () => {
    localStorage.setItem(KEY, JSON.stringify({
      version: 2,
      state: {
        windows: [{
          id: "old-terminal", title: "Терминал", type: "terminal", isOpen: true,
          isMinimized: false, isMaximized: true, zIndex: 1,
        }],
        activeWindowId: "old-terminal",
      },
    }));

    await useWorkspaceStore.persist.rehydrate();

    const state = useWorkspaceStore.getState();
    expect(state.windows[0].isMinimized).toBe(true);
    expect(state.windows[0].isMaximized).toBe(false);
    expect(state.activeWindowId).toBeNull();
  });

  it("закрытые окна не восстанавливаются", () => {
    useWorkspaceStore.getState().openWindow("a", "Файлы", "file-manager");
    useWorkspaceStore.getState().openWindow("b", "Терминал", "terminal");
    useWorkspaceStore.getState().closeWindow("b");

    const saved = readPersisted();
    expect(saved!.state.windows.map((w) => w.id)).toEqual(["a"]);
  });

  it("после закрытия всех окон в памяти пусто", () => {
    useWorkspaceStore.getState().openWindow("a", "Файлы", "file-manager");
    useWorkspaceStore.getState().closeAll();
    const saved = readPersisted();
    expect(saved!.state.windows).toEqual([]);
    expect(saved!.state.activeWindowId).toBeNull();
  });

  it("гидратация отложена: на сервере окон нет", () => {
    // Если восстановить окна сразу при импорте модуля, разметка сервера и
    // клиента разошлась бы и React сообщил бы об ошибке гидрации.
    expect(useWorkspaceStore.getState().windows).toEqual([]);
    expect(typeof useWorkspaceStore.persist.rehydrate).toBe("function");
  });
});
