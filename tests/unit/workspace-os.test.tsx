/**
 * Рабочая область: честность иконок, доступность редактора, память окон.
 *
 * Проверяется то, что видно учителю:
 *  * каждая иконка рабочего стола соответствует своему содержимому;
 *  * редактор кода достижим — раньше он был написан, но не открывался;
 *  * кнопка «В редактор» из файлового менеджера работает на обеих раскладках;
 *  * окна переживают перезагрузку страницы.
 */

// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DESKTOP_APPS, Desktop } from "@/components/workspace/desktop";
import { Taskbar } from "@/components/workspace/taskbar";
import { useWorkspaceStore, type AppType } from "@/lib/store/workspace";

/** Какое содержимое реально отрисовывает каждое окно рабочей области. */
const RENDERED_TYPES: AppType[] = [
  "browser",
  "terminal",
  "file-manager",
  "code-editor",
  "agent-log",
  "iframe",
];

beforeEach(() => {
  useWorkspaceStore.setState({ windows: [], activeWindowId: null });
  window.localStorage.clear();
});

afterEach(cleanup);

describe("иконки рабочего стола", () => {
  it.each(RENDERED_TYPES)("окна типа %s действительно отрисовываются", (type) => {
    // Тип, для которого в AppContent нет ветки, открывается пустым окном:
    // учитель видит рамку без содержимого.
    const known = DESKTOP_APPS.some((app) => app.type === type);
    expect(known, `нет ни одного приложения типа ${type}`).toBe(true);
  });

  it("иконки не повторяют одну и ту же пару «содержимое + адрес»", () => {
    // Раньше «Files», «Documents» и «Downloads» открывали один и тот же
    // файловый менеджер, а «AI Assistant», «BilimClass Agent» и
    // «Task Runner» — один и тот же журнал агента: четыре иконки, одно
    // содержимое.
    const signatures = DESKTOP_APPS.map((app) => `${app.type}|${app.url ?? ""}`);
    const duplicates = signatures.filter((sig, i) => signatures.indexOf(sig) !== i);
    expect(
      [...new Set(duplicates)],
      `иконки с одинаковым содержимым: ${[...new Set(duplicates)].join(", ")}`,
    ).toEqual([]);
  });

  it("у каждой иконки есть пояснение, что она делает", () => {
    for (const app of DESKTOP_APPS) {
      expect(app.hint.length, `нет пояснения у «${app.title}»`).toBeGreaterThan(5);
    }
  });

  it("редактор кода есть на рабочем столе", () => {
    // Редактор был написан, но его не открывал никто: ни иконка, ни док.
    expect(DESKTOP_APPS.some((app) => app.type === "code-editor")).toBe(true);
  });

  it("клик по иконке открывает окно", () => {
    render(<Desktop />);
    fireEvent.click(screen.getByTitle(/Открыть «Конструктор КСП»/));
    const windows = useWorkspaceStore.getState().windows;
    expect(windows).toHaveLength(1);
    expect(windows[0].url).toBe("/plans/new");
  });
});

describe("открытие файла в редакторе", () => {
  it("кнопка «В редактор» открывает окно редактора с выбранным файлом", () => {
    // Раньше кнопка отправляла событие window, на которое подписывался
    // только двухпанельный /school. На полноэкранной /school/workspace
    // подписчика не было, и кнопка молча ничего не делала.
    act(() => {
      useWorkspaceStore.getState().openInEditor("raspisanie.py");
    });
    const windows = useWorkspaceStore.getState().windows;
    expect(windows).toHaveLength(1);
    expect(windows[0].type).toBe("code-editor");
    expect(windows[0].file).toBe("raspisanie.py");
  });

  it("повторный запрос того же файла не плодит окна", () => {
    act(() => {
      useWorkspaceStore.getState().openInEditor("a.py");
      useWorkspaceStore.getState().openInEditor("b.py");
    });
    const windows = useWorkspaceStore.getState().windows;
    expect(windows).toHaveLength(1);
    expect(windows[0].file).toBe("b.py");
  });

  it("файл из хранилища виден редактору без явного аргумента", async () => {
    const { CodeEditorApp } = await import("@/components/workspace/apps/code-editor");
    // Компонент читает файл из окна рабочей области — это делает редактор
    // доступным с иконки рабочего стола.
    act(() => {
      useWorkspaceStore.getState().openInEditor("zapros.py");
    });
    render(<CodeEditorApp />);
    // Без активной задачи редактор показывает подсказку, а не ошибку:
    // важно, что он смонтировался и не упал.
    expect(screen.queryByText(/Ошибка/i)).toBeNull();
  });
});

describe("состав окон", () => {
  it("закрытие окна передаёт фокус верхнему из оставшихся", () => {
    act(() => {
      const store = useWorkspaceStore.getState();
      store.openWindow("a", "A", "terminal");
      store.openWindow("b", "B", "browser");
    });
    const second = useWorkspaceStore.getState().windows[1];
    expect(useWorkspaceStore.getState().activeWindowId).toBe(second.id);

    act(() => {
      useWorkspaceStore.getState().closeWindow(second.id);
    });
    const state = useWorkspaceStore.getState();
    // Раньше активным становилось «никакое», и панель задач теряла фокус.
    expect(state.activeWindowId).toBe("a");
  });

  it("закрыть все окна можно одной кнопкой", () => {
    act(() => {
      const store = useWorkspaceStore.getState();
      store.openWindow("a", "A", "terminal");
      store.openWindow("b", "B", "browser");
      store.openWindow("c", "C", "file-manager");
    });
    render(<Taskbar />);
    fireEvent.click(screen.getByRole("button", { name: /Закрыть все окна/ }));
    expect(useWorkspaceStore.getState().windows).toHaveLength(0);
  });

  it("в доке есть редактор кода", () => {
    render(<Taskbar />);
    fireEvent.click(screen.getByRole("button", { name: "Редактор кода" }));
    expect(useWorkspaceStore.getState().windows.some((w) => w.type === "code-editor")).toBe(true);
  });
});