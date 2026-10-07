'use client';

import React, { useEffect, useState } from 'react';
import { useWorkspaceStore, type AppType } from '@/lib/store/workspace';
import {
  Globe, TerminalSquare, FolderOpen, Bot, Code2,
  Wifi, Battery, Volume2, Search, Sparkles, X
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
  const { windows, activeWindowId, openWindow, focusWindow, minimizeWindow, closeAll } = useWorkspaceStore();
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
      {/* Left: Start (Exit OS) + Search */}
      <div className="flex items-center gap-1 w-52">
        <Link href="/" className="h-8 w-8 rounded-md hover:bg-white/[0.08] flex items-center justify-center transition-colors group relative" title="Выйти из рабочей области на главную">
          <svg viewBox="0 0 16 16" className="w-4 h-4 text-blue-400 group-hover:scale-90 transition-transform" fill="currentColor" aria-hidden="true">
            <rect x="1" y="1" width="6" height="6" rx="1"/>
            <rect x="9" y="1" width="6" height="6" rx="1"/>
            <rect x="1" y="9" width="6" height="6" rx="1"/>
            <rect x="9" y="9" width="6" height="6" rx="1"/>
          </svg>
        </Link>
        <button
          className="h-8 w-8 rounded-md hover:bg-white/[0.08] flex items-center justify-center transition-colors"
          title="Развернуть свёрнутое окно"
          aria-label="Развернуть свёрнутое окно"
          onClick={() => {
            // Раньше кнопка была без обработчика: клик ничего не делал.
            const firstMinimized = windows.find(w => w.isMinimized);
            if (firstMinimized) focusWindow(firstMinimized.id);
          }}
        >
          <Search className="w-4 h-4 text-white/50" />
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
          title="AI Assistant"
          aria-label="Открыть AI-ассистента"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="text-[10px] font-medium uppercase tracking-wider">AI</span>
        </button>
        <div className="flex items-center gap-2 text-white/50" aria-hidden="true">
          <Wifi className="w-3.5 h-3.5" />
          <Volume2 className="w-3.5 h-3.5" />
          <Battery className="w-3.5 h-3.5" />
        </div>
        <div className="flex flex-col items-end rounded px-2 py-1 select-none" aria-label={`Время ${time}, ${date}`}>
          <span className="text-[11px] text-white/80 font-medium leading-tight">{time}</span>
          <span className="text-[10px] text-white/50 leading-tight">{date}</span>
        </div>
      </div>
    </div>
  );
}