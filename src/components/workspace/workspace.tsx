"use client";

import React, { useCallback } from "react";
import { useWorkspaceStore, type AppType, type WindowState } from "@/lib/store/workspace";
import { Desktop } from "./desktop";
import { Taskbar } from "./taskbar";
import { Window } from "./window";
import { BrowserApp } from "./apps/browser";
import { TerminalApp } from "./apps/terminal";
import { FileManagerApp } from "./apps/file-manager";
import { AgentLogApp } from "./apps/agent-log";
import { IframeApp } from "./apps/iframe";

/** Соберёт содержимое окна по его типу. */
function AppContent({ win }: { win: WindowState }) {
  switch (win.type) {
    case "browser":
      return <BrowserApp />;
    case "terminal":
      return <TerminalApp />;
    case "file-manager":
      return <FileManagerApp />;
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
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center">
      <p className="max-w-sm text-sm leading-6 text-white/45">
        Откройте приложение на рабочем столе или в панели задач — здесь агент
        показывает результат работы: команды, файлы и страницы.
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