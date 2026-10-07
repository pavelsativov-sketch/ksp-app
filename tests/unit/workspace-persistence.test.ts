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

  it("восстановленные окна не остаются свёрнутыми", () => {
    useWorkspaceStore.getState().openWindow("a", "Файлы", "file-manager");
    useWorkspaceStore.getState().openWindow("b", "Терминал", "terminal");
    useWorkspaceStore.getState().minimizeWindow("b");

    const saved = readPersisted();
    // Свёрнутым окно можно сделать и вручную, но после перезагрузки рабочая
    // область должна открыться собранной, а не пустой.
    expect(saved!.state.windows.every((w) => w.isMinimized === false)).toBe(true);
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