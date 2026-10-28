"use client";

import React, { useCallback, useEffect } from "react";
import { LayoutGrid, Minus, X } from "lucide-react";
import { useWorkspaceStore, type AppType, type WindowState } from "@/lib/store/workspace";
import { Desktop } from "./desktop";
import { Taskbar } from "./taskbar";
import { Window } from "./window";
import { BrowserApp } from "./apps/browser";
import { TerminalApp } from "./apps/terminal";
import { FileManagerApp } from "./apps/file-manager";
import { CodeEditorApp } from "./apps/code-editor";
import { ComputerUseApp } from "./apps/computer-use";
import { AgentLogApp } from "./apps/agent-log";
import { IframeApp } from "./apps/iframe";
import { APP_ICONS } from "./app-icons";

/** Соберёт содержимое окна по его типу. */
function AppContent({ win }: { win: WindowState }) {
  switch (win.type) {
    case "browser":
      return <BrowserApp initialUrl={win.url} />;
    case "terminal":
      return <TerminalApp />;
    case "file-manager":
      return <FileManagerApp />;
    // Редактор был написан, но его не открывал никто: ни одна иконка, ни
    // один пункт меню. Окно такого типа открывалось пустым.
    case "code-editor":
      return <CodeEditorApp />;
    // Агент «Использование компьютера»: смотрит на экран и выполняет задачи.
    case "computer-use":
      return <ComputerUseApp initialUrl={win.url} />;
    case "agent-log":
      return <AgentLogApp />;
    case "iframe":
      return win.url ? <IframeApp url={win.url} title={win.title} /> : null;
    default:
      return null;
  }
}

/** Окна, сохранённые в браузере, один раз за загрузку страницы возвращаются свёрнутыми. */
let restoredThisPageLoad = false;

/**
 * Рабочая область ОС: рабочий стол с иконками, плавающие окна и панель окон.
 *
 * Поверхность встраивается в родителя (`relative overflow-hidden`), поэтому
 * окна позиционируются относительно неё, а не экрана. Полноэкранный
 * вариант — обёртка `Workspace` ниже, где панель окон заменяет `Taskbar`.
 */
export function WorkspaceSurface({ showDesktop = true, showTray = true }: { showDesktop?: boolean; showTray?: boolean }) {
  const windows = useWorkspaceStore((s) => s.windows);
  const closeWindow = useWorkspaceStore((s) => s.closeWindow);

  // Окна восстанавливаются после монтирования: на сервере их нет, и если
  // прочитать сохранённое состояние сразу, разметка сервера и клиента
  // разошлась бы и React выдал бы ошибку гидрации. Открываются они свёрнутыми:
  // иначе после перезагрузки старые окна закрывали бы иконки рабочего стола.
  useEffect(() => {
    const persist = useWorkspaceStore.persist;
    // Сворачиваем сразу после чтения хранилища, а не в отдельной микрозадаче:
    // эффект родителя открывает окно по ссылке (`?os=computer-use`) сразу после
    // этого эффекта, и отложенное сворачивание прятало бы только что открытое окно.
    const minimizeRestored = () => {
      if (restoredThisPageLoad) return;
      restoredThisPageLoad = true;
      useWorkspaceStore.getState().minimizeAll();
    };
    void persist.rehydrate();
    if (persist.hasHydrated()) minimizeRestored();
    else return persist.onFinishHydration(minimizeRestored);
  }, []);

  const handleClose = useCallback((id: string) => closeWindow(id), [closeWindow]);
  const open = windows.filter((w) => w.isOpen);
  const visible = open.filter((w) => !w.isMinimized);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="sky-night relative min-h-0 flex-1 overflow-hidden">
        {showDesktop && <Desktop />}
        {open.map((win) => (
          <Window key={win.id} id={win.id} title={win.title} onClose={() => handleClose(win.id)}>
            <AppContent win={win} />
          </Window>
        ))}
        {visible.length === 0 && showDesktop && <EmptyHint hasWindows={open.length > 0} />}
      </div>
      {showTray && open.length > 0 && <WindowTray />}
    </div>
  );
}

/** Панель окон: вернуть свёрнутое окно, переключиться, закрыть, показать рабочий стол. */
function WindowTray() {
  const windows = useWorkspaceStore((s) => s.windows);
  const activeWindowId = useWorkspaceStore((s) => s.activeWindowId);
  const focusWindow = useWorkspaceStore((s) => s.focusWindow);
  const minimizeWindow = useWorkspaceStore((s) => s.minimizeWindow);
  const closeWindow = useWorkspaceStore((s) => s.closeWindow);
  const minimizeAll = useWorkspaceStore((s) => s.minimizeAll);
  const closeAll = useWorkspaceStore((s) => s.closeAll);

  return (
    <div role="toolbar" aria-label="Открытые окна" className="flex h-9 shrink-0 items-center gap-1 border-t border-white/10 bg-[#0b0d13] px-2">
      <button
        type="button"
        onClick={minimizeAll}
        title="Свернуть все окна и показать рабочий стол"
        aria-label="Показать рабочий стол"
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-300 hover:bg-white/10"
      >
        <LayoutGrid className="size-4" />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
        {windows.filter((w) => w.isOpen).map((w) => {
          const Icon = APP_ICONS[w.type];
          const active = activeWindowId === w.id && !w.isMinimized;
          return (
            <div
              key={w.id}
              className={`group flex h-7 max-w-[170px] shrink-0 items-center rounded-md border text-xs ${active ? 'border-white/20 bg-white/10 text-white' : 'border-transparent text-slate-400 hover:bg-white/5'}`}
            >
              <button
                type="button"
                onClick={() => (active ? minimizeWindow(w.id) : focusWindow(w.id))}
                title={w.isMinimized ? `Вернуть «${w.title}»` : active ? `Свернуть «${w.title}»` : `Перейти к «${w.title}»`}
                aria-label={`Окно «${w.title}»${w.isMinimized ? ', свёрнуто' : ''}`}
                aria-pressed={active}
                className={`flex min-w-0 items-center gap-1.5 pl-2 pr-1 ${w.isMinimized ? 'opacity-60' : ''}`}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{w.title}</span>
              </button>
              <button
                type="button"
                onClick={() => closeWindow(w.id)}
                aria-label={`Закрыть «${w.title}» в панели окон`}
                title="Закрыть"
                className="mr-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-red-500/30 hover:text-white"
              >
                <X className="size-3" />
              </button>
            </div>
          );
        })}
      </div>
      {windows.length > 1 && (
        <button
          type="button"
          onClick={closeAll}
          title="Закрыть все окна"
          aria-label="Закрыть все окна в панели окон"
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] text-slate-400 hover:bg-white/10 hover:text-white"
        >
          <Minus className="size-3 rotate-90" aria-hidden="true" /> Закрыть все
        </button>
      )}
    </div>
  );
}

/** Подсказка, пока ни одно окно не открыто. */
function EmptyHint({ hasWindows = false }: { hasWindows?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 hidden justify-end pr-4 text-center sm:flex max-[500px]:hidden [@media(max-height:220px)]:hidden">
      <p className="max-w-[250px] rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-xs leading-5 text-white/45">
        {hasWindows
          ? "Окна свёрнуты — верните их в панели окон снизу или откройте приложение на рабочем столе."
          : "Откройте приложение на рабочем столе — здесь агент показывает файлы и страницы внешних сервисов, с которыми работает."}
      </p>
    </div>
  );
}

/**
 * Полноэкранная рабочая область: сама занимает окно браузера.
 * Используется на /school/workspace, где раздел открыт как отдельная ОС.
 */
export function Workspace() {
  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-[#0f0c29] text-white">
      <WorkspaceSurface showTray={false} />
      <Taskbar />
    </div>
  );
}

export type { AppType };
