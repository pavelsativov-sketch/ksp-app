"use client";

import React, { useCallback, useEffect } from "react";
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
      return <ComputerUseApp />;
    case "agent-log":
      return <AgentLogApp />;
    case "iframe":
      return win.url ? <IframeApp url={win.url} /> : null;
    default:
      return null;
  }
}

/**
 * Рабочая область ОС: рабочий стол с иконками и плавающие окна.
 *
 * Поверхность встраивается в родителя (`relative overflow-hidden`), поэтому
 * окна позиционируются относительно неё, а не экрана. Полноэкранный
 * вариант — обёртка `Workspace` ниже.
 */
export function WorkspaceSurface({ showDesktop = true }: { showDesktop?: boolean }) {
  const windows = useWorkspaceStore((s) => s.windows);
  const closeWindow = useWorkspaceStore((s) => s.closeWindow);

  // Окна восстанавливаются после монтирования: на сервере их нет, и если
  // прочитать сохранённое состояние сразу, разметка сервера и клиента
  // разошлась бы и React выдал бы ошибку гидрации.
  useEffect(() => {
    void useWorkspaceStore.persist.rehydrate();
  }, []);

  const handleClose = useCallback((id: string) => closeWindow(id), [closeWindow]);
  const open = windows.filter((w) => w.isOpen);

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-[#0f0c29]">
      {showDesktop && <Desktop />}
      {open.map((win) => (
        <Window key={win.id} id={win.id} title={win.title} onClose={() => handleClose(win.id)}>
          <AppContent win={win} />
        </Window>
      ))}
      {open.length === 0 && showDesktop && <EmptyHint />}
    </div>
  );
}

/** Подсказка, пока ни одно окно не открыто. */
function EmptyHint() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-16 hidden justify-center px-6 text-center sm:flex max-[500px]:hidden [@media(max-height:220px)]:hidden">
      <p className="max-w-sm rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-xs leading-5 text-white/45">
        Откройте приложение на рабочем столе или в панели задач — здесь агент
        показывает файлы и страницы внешних сервисов, с которыми работает агент.
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
      <WorkspaceSurface />
      <Taskbar />
    </div>
  );
}

export type { AppType };
