import type { LucideIcon } from 'lucide-react';
import { Bot, Code2, FileEdit, FolderOpen, Globe, MonitorPlay, TerminalSquare } from 'lucide-react';
import type { AppType } from '@/lib/store/workspace';

/** Значок приложения по типу окна: заголовок окна и панель окон показывают одно и то же. */
export const APP_ICONS: Record<AppType, LucideIcon> = {
  browser: Globe,
  terminal: TerminalSquare,
  'file-manager': FolderOpen,
  'code-editor': Code2,
  'agent-log': Bot,
  'computer-use': MonitorPlay,
  iframe: FileEdit,
};
