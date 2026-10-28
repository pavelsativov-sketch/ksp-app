'use client';

import React from 'react';
import { useWorkspaceStore, type AppType } from '@/lib/store/workspace';
import type { LucideIcon } from 'lucide-react';
import {
  Globe, TerminalSquare, FolderOpen, Bot, FileEdit,
  BarChart3, GraduationCap, Code2, MonitorPlay,
} from 'lucide-react';

/**
 * Приложения рабочего стола.
 *
 * Раньше здесь было 11 иконок, но четыре из них показывали одно и то же:
 * «Files», «Documents» и «Downloads» открывали один и тот же файловый
 * менеджер песочницы, а «AI Assistant», «BilimClass Agent» и «Task Runner» —
 * один и тот же журнал агента. Учитель нажимал «Загрузки» и видел файлы
 * задачи, а «NOBD Agent» открывал страницу интеграций.
 *
 * Теперь каждая иконка соответствует своему содержимому. Добавлен редактор
 * кода: он был написан и полностью работал, но его не открывал никто.
 */
export interface DesktopApp {
  id: string;
  title: string;
  type: AppType;
  url?: string;
  Icon: LucideIcon;
  color: string;
  /** Что показывает приложение — подсказка на иконке. */
  hint: string;
}

export const DESKTOP_APPS: DesktopApp[] = [
  {
    id: 'ai-assistant', title: 'Журнал агента', type: 'agent-log', Icon: Bot, color: '#a855f7',
    hint: 'Команды, файлы и события задачи агента',
  },
  {
    id: 'browser-main', title: 'Браузер', type: 'browser', Icon: Globe, color: '#3b82f6',
    hint: 'Страницы, которые открывает агент',
  },
  {
    id: 'files-main', title: 'Файлы задачи', type: 'file-manager', Icon: FolderOpen, color: '#f59e0b',
    hint: 'Файлы, созданные агентом в рабочей папке',
  },
  {
    id: 'code-editor', title: 'Редактор кода', type: 'code-editor', Icon: Code2, color: '#0ea5e9',
    hint: 'Правка файлов задачи прямо в браузере',
  },
  {
    id: 'computer-use', title: 'Работа с компьютером', type: 'computer-use', Icon: MonitorPlay, color: '#8b5cf6',
    hint: 'Агент смотрит на экран и выполняет задачи в браузере',
  },
  {
    id: 'terminal-main', title: 'Терминал', type: 'terminal', Icon: TerminalSquare, color: '#64748b',
    hint: 'Команды в рабочей среде задачи',
  },
  {
    id: 'ksp-builder', title: 'Конструктор КСП', type: 'iframe', url: '/plans/new', Icon: FileEdit, color: '#22c55e',
    hint: 'Новый урок: тема, цели, ход урока',
  },
  {
    id: 'analytics-main', title: 'Аналитика школы', type: 'iframe', url: '/school/dashboard', Icon: BarChart3, color: '#6366f1',
    hint: 'Успеваемость и посещаемость класса',
  },
  {
    id: 'bilimclass-agent', title: 'BilimClass', type: 'browser', url: 'https://www.bilimclass.kz/login', Icon: GraduationCap, color: '#14b8a6',
    hint: 'Войдите в свой аккаунт в браузере; агент работает с системой',
  },
  {
    id: 'nobd-agent', title: 'НОБД', type: 'browser', url: 'https://nobd.edu.kz/login', Icon: GraduationCap, color: '#0f766e',
    hint: 'Войдите в государственную систему в браузере',
  },
];

/**
 * Колонка иконок вдоль левого края, как в референсе: вертикальный поток с
 * переносом в новую колонку по высоте. Раньше был грид сверху-слева, и при
 * высоком экране справа оставалась пустая ширина, торгающая обои.
 */
export function Desktop() {
  const openWindow = useWorkspaceStore((s) => s.openWindow);
  const windows = useWorkspaceStore((s) => s.windows);

  return (
    <div className="absolute inset-0 flex h-full max-h-full flex-col flex-wrap content-start items-start gap-x-1 gap-y-0 p-5">
      {DESKTOP_APPS.map(app => (
        <button
          key={app.id}
          type="button"
          className="group w-[84px] h-[96px] flex flex-col items-center justify-start pt-2 gap-1.5 rounded-xl hover:bg-white/[0.08] active:bg-white/[0.14] cursor-default select-none transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffb81c]/80 focus:bg-white/[0.08]"
          onClick={() => openWindow(app.id, app.title, app.type, app.url)}
          title={`Открыть «${app.title}» — ${app.hint}`}
        >
          <div
            className="w-12 h-12 rounded-[15px] flex items-center justify-center shadow-lg shadow-black/40 ring-1 ring-white/25 transition-transform duration-200 group-hover:scale-110"
            style={{ background: `linear-gradient(145deg, ${app.color}f2, ${app.color}99)` }}
          >
            <app.Icon className="w-6 h-6 text-white drop-shadow" strokeWidth={1.8} />
          </div>
          <span className="text-[11px] text-white/90 text-center leading-tight font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] line-clamp-2 px-0.5">
            {app.title}
          </span>
          {windows.some((w) => w.id === app.id) && (
            <span aria-hidden="true" className="-mt-0.5 h-1 w-1 rounded-full bg-sky-300" />
          )}
        </button>
      ))}
    </div>
  );
}
