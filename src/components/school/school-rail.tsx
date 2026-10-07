"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  MessageSquare, FolderKanban, FolderOpen, Monitor, Bot, Settings, MoreHorizontal,
  BarChart2, ClipboardCheck, GraduationCap, PenTool, Users, BookOpen,
  TrendingUp, FileText, Link2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useOsShellStore } from "@/lib/store/os-shell";
import { useUiLocale } from "@/components/i18n/use-ui-locale";

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
 * Остальные разделы школы.
 *
 * Страницы существуют и работают, но на них не было ни одной ссылки: их
 * перечислял только `app/school/sidebar.tsx` — файл, который никогда не
 * рендерился. Из-за этого разделы ниже были недостижимы: ни через меню, ни
 * через рельс.
 *
 * Рельс рассчитан на шесть плиток, поэтому остальные спрятаны под «Ещё»:
 * прямое добавление девяти иконок сломало бы его вид и не поместилось бы по
 * высоте.
 *
 * Список содержит только реально существующие маршруты `src/app/school/*`.
 * Раньше здесь стояли `/school/analytics`, `/school/grades` и
 * `/school/assignments` — таких страниц нет, и ссылки были бы битыми.
 *
 * Подписи берутся из словаря (`t.school.nav.*`), а не пишутся в коде: эти же
 * ключи использовал удалённый `app/school/sidebar.tsx`, и казахский учитель
 * видел русские пункты.
 */
export const MORE_SECTIONS: { key: string; icon: LucideIcon; href: string }[] = [
  { key: "classes", icon: GraduationCap, href: "/school/classes" },
  { key: "students", icon: Users, href: "/school/students" },
  { key: "teachers", icon: PenTool, href: "/school/teachers" },
  { key: "attendance", icon: ClipboardCheck, href: "/school/attendance" },
  { key: "curriculum", icon: BookOpen, href: "/school/curriculum" },
  { key: "quality", icon: TrendingUp, href: "/school/quality" },
  { key: "reports", icon: BarChart2, href: "/school/reports" },
  { key: "vsk", icon: FileText, href: "/school/vsk" },
  { key: "connectors", icon: Link2, href: "/school/connectors" },
];

/**
 * Плитка «Ещё» со списком остальных разделов.
 *
 * Список экспортируется наружу: тест сверяет его с реальными страницами в
 * `src/app/school/*`, иначе в навигацию снова могут попасть битые ссылки.
 */
export function MoreSections() {
  const pathname = usePathname() ?? "/school";
  const { t } = useUiLocale();
  const nav = t.school.nav;
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Закрываем по клику вне и по Escape: список из девяти пунктов не должен
  // висеть поверх рабочей области после перехода.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const activeHere = MORE_SECTIONS.some((section) => pathname.startsWith(section.href));

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`flex w-[60px] flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] transition-colors ${
          activeHere || open ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
        }`}
      >
        <span className="flex size-8 items-center justify-center rounded-[10px] bg-white/5 border border-white/15">
          <MoreHorizontal className="size-4" style={{ color: "#cbd5e1" }} />
        </span>
        {t.school.nav.more ?? "Ещё"}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-full top-0 z-50 ml-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#0b0d13] py-1 shadow-2xl"
        >
          {MORE_SECTIONS.map(({ key, icon: Icon, href }) => (
            <Link
              key={href}
              role="menuitem"
              href={href}
              aria-current={pathname.startsWith(href) ? "page" : undefined}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                pathname.startsWith(href)
                  ? "bg-white/10 text-white"
                  : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className="size-4 shrink-0 text-slate-400" />
              {nav[key as keyof typeof nav] ?? key}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

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
      <MoreSections />
    </aside>
  );
}
