'use client';

import React, { useEffect, useState } from 'react';
import { useWorkspaceStore, type AppType } from '@/lib/store/workspace';
import {
  Globe, TerminalSquare, FolderOpen, Bot, Code2,
  LayoutGrid, MonitorPlay, Sparkles, X
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

/**
 * Приложения дока.
 *
 * Список совпадает с рабочим столом: раньше в доке не было редактора кода,
 * хотя сам редактор существовал и открывался из файлового менеджера.
 */
const DOCK_APPS: { id: string; title: string; type: AppType; url?: string; Icon: LucideIcon }[] = [
  { id: 'ai-assistant', title: 'Журнал агента', type: 'agent-log', Icon: Bot },
  { id: 'browser-main', title: 'Браузер', type: 'browser', Icon: Globe },
  { id: 'files-main', title: 'Файлы задачи', type: 'file-manager', Icon: FolderOpen },
  { id: 'code-editor', title: 'Редактор кода', type: 'code-editor', Icon: Code2 },
  { id: 'terminal-main', title: 'Терминал', type: 'terminal', Icon: TerminalSquare },
];

export function Taskbar({ onToggleCopilot, copilotOpen }: { onToggleCopilot?: () => void, copilotOpen?: boolean }) {
  const { windows, activeWindowId, openWindow, focusWindow, minimizeWindow, minimizeAll, closeAll } = useWorkspaceStore();
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
      setDate(now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }));
    };
    update();
    const int = setInterval(update, 10000);
    return () => clearInterval(int);
  }, []);

  const handleDockClick = (app: typeof DOCK_APPS[number]) => {
    const existing = windows.find(w => w.id === app.id);
    if (existing) {
      if (activeWindowId === app.id && !existing.isMinimized) {
        minimizeWindow(app.id);
      } else {
        focusWindow(app.id);
      }
    } else {
      openWindow(app.id, app.title, app.type, app.url);
    }
  };

  return (
    <div className="h-12 bg-[#1a1a2e]/80 backdrop-blur-2xl border-t border-white/[0.06] flex items-center justify-between px-3 shrink-0 relative z-[9999]">
      {/* Start/exit control stays explicit; an unlabeled icon was easy to miss. */}
      <div className="flex w-52 items-center gap-1">
        <Link href="/school" aria-label="Главное меню школы" className="inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-xs font-semibold text-white/75 transition-colors hover:bg-white/[0.08] hover:text-white" title="Вернуться в главное меню школы">
          <LayoutGrid className="size-4 text-blue-300" aria-hidden="true" />
          <span>Главное меню</span>
        </Link>
        <button type="button" onClick={minimizeAll} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white" title="Свернуть окна и показать рабочий стол" aria-label="Показать рабочий стол">
          <MonitorPlay className="size-4 text-sky-300" aria-hidden="true" />
          <span>Рабочий стол</span>
        </button>
      </div>

      {/* Center: Dock */}
      <div className="flex items-center gap-0.5 absolute left-1/2 -translate-x-1/2">
        {DOCK_APPS.map(app => {
          const isOpen = windows.some(w => w.id === app.id);
          const isActive = activeWindowId === app.id;
          return (
            <button
              key={app.id}
              onClick={() => handleDockClick(app)}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all relative group
                ${isActive ? 'bg-white/[0.14]' : 'hover:bg-white/[0.08]'}`}
              title={app.title}
            >
              <app.Icon className={`w-5 h-5 transition-colors ${isOpen ? 'text-white' : 'text-white/50'}`} strokeWidth={1.8} />
              {isOpen && (
                <div className={`absolute -bottom-0.5 rounded-full transition-all ${isActive ? 'w-4 h-[3px] bg-blue-400' : 'w-1.5 h-[3px] bg-white/40'}`} />
              )}
            </button>
          );
        })}

        {/* Separator */}
        <div className="w-px h-6 bg-white/10 mx-1" />

        {/* Закрыть всё: окна сохраняются в браузере, поэтому без этой
            кнопки рабочую область приходилось чистить по одной. */}
        {windows.length > 1 && (
          <button
            onClick={closeAll}
            className="flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-[11px] text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white/80"
            title="Закрыть все окна"
            aria-label="Закрыть все окна"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Running windows not in dock */}
        {windows.filter(w => !DOCK_APPS.some(d => d.id === w.id)).map(w => (
          <button
            key={w.id}
            onClick={() => {
              if (activeWindowId === w.id && !w.isMinimized) minimizeWindow(w.id);
              else focusWindow(w.id);
            }}
            className={`h-10 px-3 rounded-lg text-xs font-medium truncate max-w-[140px] transition-all relative
              ${activeWindowId === w.id ? 'bg-white/[0.14] text-white' : 'hover:bg-white/[0.08] text-white/60'}`}
            title={w.title}
          >
            {w.title}
            <div className={`absolute -bottom-0.5 left-1/2 -translate-x-1/2 rounded-full transition-all ${activeWindowId === w.id ? 'w-4 h-[3px] bg-blue-400' : 'w-1.5 h-[3px] bg-white/40'}`} />
          </button>
        ))}
      </div>

      {/* Right: System Tray */}
      <div className="flex items-center gap-2 w-52 justify-end">
        <button
          onClick={onToggleCopilot ?? (() => handleDockClick(DOCK_APPS[0]))}
          className={`h-7 px-2 rounded flex items-center gap-1 transition-colors border ${copilotOpen ? 'bg-purple-500/20 border-purple-500/30 text-purple-300' : 'hover:bg-white/[0.08] border-transparent text-white/50'}`}
          title="Журнал агента"
          aria-label="Открыть журнал агента"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="text-[10px] font-medium uppercase tracking-wider">AI</span>
        </button>
        <div className="flex flex-col items-end rounded px-2 py-1 select-none" aria-label={`Время ${time}, ${date}`}>
          <span className="text-[11px] text-white/80 font-medium leading-tight">{time}</span>
          <span className="text-[10px] text-white/50 leading-tight">{date}</span>
        </div>
      </div>
    </div>
  );
}
