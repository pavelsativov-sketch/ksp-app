'use client';

import React from 'react';
import { useWorkspaceStore, type AppType } from '@/lib/store/workspace';
import type { LucideIcon } from 'lucide-react';
import { 
  Globe, TerminalSquare, FolderOpen, Bot, FileEdit, 
  BarChart3, GraduationCap, PlayCircle, FileText,
  Download, ClipboardCheck
} from 'lucide-react';

const DESKTOP_APPS: { id: string; title: string; type: AppType; url?: string; Icon: LucideIcon; color: string }[] = [
  { id: 'ai-assistant', title: 'AI Assistant', type: 'agent-log', Icon: Bot, color: '#a855f7' },
  { id: 'browser-main', title: 'Browser', type: 'browser', Icon: Globe, color: '#3b82f6' },
  { id: 'files-main', title: 'Files', type: 'file-manager', Icon: FolderOpen, color: '#f59e0b' },
  { id: 'terminal-main', title: 'Terminal', type: 'terminal', Icon: TerminalSquare, color: '#64748b' },
  { id: 'documents', title: 'Documents', type: 'file-manager', Icon: FileText, color: '#06b6d4' },
  { id: 'downloads', title: 'Downloads', type: 'file-manager', Icon: Download, color: '#10b981' },
  { id: 'ksp-builder', title: 'KSP Builder', type: 'iframe', url: '/plans/new', Icon: FileEdit, color: '#22c55e' },
  { id: 'analytics-main', title: 'School Analytics', type: 'iframe', url: '/school/dashboard', Icon: BarChart3, color: '#6366f1' },
  { id: 'bilimclass', title: 'BilimClass Agent', type: 'agent-log', Icon: GraduationCap, color: '#14b8a6' },
  { id: 'nobd-agent', title: 'NOBD Agent', type: 'iframe', url: '/school/connectors', Icon: ClipboardCheck, color: '#f97316' },
  { id: 'task-runner', title: 'Task Runner', type: 'agent-log', Icon: PlayCircle, color: '#ef4444' },
];

export function Desktop() {
  const { openWindow } = useWorkspaceStore();

  return (
    <div className="flex-1 relative overflow-hidden p-5 grid grid-cols-[repeat(auto-fill,88px)] grid-rows-[repeat(auto-fill,100px)] gap-x-1 gap-y-0 content-start items-start">
      {DESKTOP_APPS.map(app => (
        <button
          key={app.id}
          type="button"
          className="w-[84px] h-[96px] flex flex-col items-center justify-start pt-2 gap-1.5 rounded-lg hover:bg-white/[0.08] active:bg-white/[0.14] cursor-default select-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus:bg-white/[0.08]"
          onClick={() => openWindow(app.id, app.title, app.type, app.url)}
          title={`Открыть ${app.title}`}
        >
          <div
            className="w-12 h-12 rounded-[14px] flex items-center justify-center shadow-lg"
            style={{ background: `linear-gradient(135deg, ${app.color}dd, ${app.color}88)` }}
          >
            <app.Icon className="w-6 h-6 text-white drop-shadow" strokeWidth={1.8} />
          </div>
          <span className="text-[11px] text-white/90 text-center leading-tight font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] line-clamp-2 px-0.5">
            {app.title}
          </span>
        </button>
      ))}
    </div>
  );
}