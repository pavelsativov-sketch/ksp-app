"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MessageSquare, FolderKanban, FolderOpen, Monitor, Bot, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useOsShellStore } from "@/lib/store/os-shell";

interface RailItem {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
  href?: string;
  exact?: boolean;
  tab?: "os" | "files";
}

/** Шесть плиток как в референсе: чат, проекты, файлы, ОС, агенты, настройки. */
const ITEMS: RailItem[] = [
  { id: "chat", label: "Чат", icon: MessageSquare, color: "#38bdf8", href: "/school", exact: true },
  { id: "projects", label: "Проекты", icon: FolderKanban, color: "#a78bfa", href: "/school/dashboard" },
  { id: "files", label: "Файлы", icon: FolderOpen, color: "#f59e0b", tab: "files" },
  { id: "os", label: "ОС", icon: Monitor, color: "#34d399", tab: "os" },
  { id: "agents", label: "Агенты", icon: Bot, color: "#f472b6", href: "/school/agents" },
  { id: "settings", label: "Настройки", icon: Settings, color: "#94a3b8", href: "/school/settings" },
];

/**
 * Левый рельс навигации. Плитки «Файлы» и «ОС» переключают вкладку правой
 * панели рабочей области, поэтому они не ссылки, а кнопки: так переключение
 * мгновенное и не перезагружает страницу.
 */
export function SchoolRail() {
  const pathname = usePathname() ?? "/school";
  const router = useRouter();
  const tab = useOsShellStore((s) => s.tab);
  const setTab = useOsShellStore((s) => s.setTab);
  const onWorkspace = pathname === "/school";

  function openTab(next: "os" | "files") {
    setTab(next);
    if (!onWorkspace) router.push("/school");
  }

  return (
    <aside aria-label="Разделы рабочей области" className="flex w-[76px] shrink-0 flex-col items-center gap-1 border-r border-white/10 bg-[#0b0d13] py-3">
      {ITEMS.map(({ id, label, icon: Icon, color, href, exact, tab: itemTab }) => {
        const active = itemTab
          ? onWorkspace && tab === itemTab
          : exact
            ? pathname === href
            : pathname.startsWith(href!);
        const className = `flex w-[60px] flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] transition-colors ${
          active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
        }`;
        const body = (
          <>
            <span className="flex size-8 items-center justify-center rounded-[10px]" style={{ background: `linear-gradient(135deg, ${color}33, ${color}14)`, border: `1px solid ${color}55` }}>
              <Icon className="size-4" style={{ color }} />
            </span>
            {label}
          </>
        );

        if (itemTab) {
          return (
            <button
              key={id}
              type="button"
              onClick={() => openTab(itemTab)}
              aria-pressed={active}
              className={className}
            >
              {body}
            </button>
          );
        }

        return (
          <Link key={id} href={href!} aria-current={active ? "page" : undefined} className={className}>
            {body}
          </Link>
        );
      })}
    </aside>
  );
}
