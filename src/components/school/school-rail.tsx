"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  MessageSquare, FolderKanban, FolderOpen, Monitor, Bot, Settings, MoreHorizontal,
  BarChart3, UserCheck, Compass, Users, FileText, Link2,
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
export const MORE_SECTIONS: { key: string; label: string; icon: LucideIcon; href: string; color: string }[] = [
  { key: "sorSoch", label: "Анализ СОР и СОЧ", icon: BarChart3, href: "/school/sor-soch", color: "#34d399" },
  { key: "vsk", label: "Справки ВШК", icon: FileText, href: "/school/vsk", color: "#60a5fa" },
  { key: "characteristics", label: "Характеристики", icon: UserCheck, href: "/school/characteristics", color: "#f472b6" },
  { key: "homeroom", label: "Классное руководство", icon: Users, href: "/school/homeroom", color: "#fbbf24" },
  { key: "iom", label: "Маршруты ИОМ", icon: Compass, href: "/school/iom", color: "#a78bfa" },
  { key: "connectors", label: "Подключения", icon: Link2, href: "/school/connectors", color: "#38bdf8" },
];

/** Общий вид плитки рельса: активная подсвечена и получает золотую отметку слева. */
function tileClass(active: boolean): string {
  return `relative flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2.5 text-[10.5px] font-semibold tracking-wide transition-all duration-200 ${
    active
      ? "bg-gradient-to-b from-white/[0.16] to-white/[0.04] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_8px_24px_rgba(0,0,0,0.35)] ring-1 ring-[#ffb81c]/45"
      : "text-slate-400 hover:-translate-y-0.5 hover:bg-white/[0.07] hover:text-slate-100"
  }`;
}

function ActiveBar() {
  return (
    <span
      aria-hidden="true"
      className="absolute -left-[11px] top-1/2 h-9 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-[#ffd45e] to-[#ffb81c] shadow-[0_0_14px_rgba(255,184,28,0.75)]"
    />
  );
}

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
        className={`${tileClass(activeHere || open)} w-[68px]`}
      >
        {(activeHere || open) && <ActiveBar />}
        <span
          className="flex size-9 items-center justify-center rounded-xl border border-white/20 bg-white/[0.07]"
          style={activeHere || open ? { boxShadow: "0 0 18px rgba(203,213,225,0.35)" } : undefined}
        >
          <MoreHorizontal className="size-[18px] text-slate-200" />
        </span>
        {t.school.nav.more ?? "Ещё"}
      </button>
      {open && (
        <div
          role="menu"
          className="glass absolute bottom-0 left-full z-50 ml-3 w-72 overflow-hidden rounded-2xl p-2 shadow-2xl"
          style={{ background: "linear-gradient(160deg, rgba(10,22,80,0.96), rgba(6,12,38,0.97))" }}
        >
          <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#ffd45e]">Все разделы школы</p>
          {MORE_SECTIONS.map(({ key, label, icon: Icon, href, color }) => {
            const current = pathname.startsWith(href);
            return (
              <Link
                key={href}
                role="menuitem"
                href={href}
                aria-current={current ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`group flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-all ${
                  current ? "bg-white/[0.12] text-white" : "text-slate-300 hover:bg-white/[0.08] hover:text-white"
                }`}
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-[10px] transition-transform group-hover:scale-110"
                  style={{ background: `linear-gradient(145deg, ${color}40, ${color}14)`, border: `1px solid ${color}66` }}
                >
                  <Icon className="size-4" style={{ color }} />
                </span>
                <span className="min-w-0 flex-1 truncate">{nav[key as keyof typeof nav] ?? label}</span>
                {current && <span className="size-1.5 rounded-full bg-[#ffb81c] shadow-[0_0_8px_rgba(255,184,28,0.9)]" />}
              </Link>
            );
          })}
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

  const primary = ITEMS.filter((item) => item.id !== "settings");
  const settings = ITEMS.find((item) => item.id === "settings")!;

  function renderItem({ id, label, icon: Icon, color, href, exact, tab: itemTab }: RailItem) {
    // «Чат» и «ОС» живут на одной странице. Чтобы подсвечен был один пункт, чат
    // считается активным, только когда справа открыто что-то, кроме рабочего
    // стола и файлов (браузер, редактор, терминал, журнал).
    const active = itemTab
      ? onWorkspace && tab === itemTab
      : id === "chat"
        ? pathname === href && !(tab === "os" || tab === "files")
        : exact
          ? pathname === href
          : pathname.startsWith(href!);
    const className = `${tileClass(active)} w-[68px]`;
    const body = (
      <>
        {active && <ActiveBar />}
        <span
          className="flex size-9 items-center justify-center rounded-xl transition-transform duration-200"
          style={{
            background: `linear-gradient(145deg, ${color}${active ? "66" : "38"}, ${color}${active ? "26" : "10"})`,
            border: `1px solid ${color}${active ? "99" : "55"}`,
            boxShadow: active ? `0 0 20px ${color}66` : undefined,
          }}
        >
          <Icon className="size-[18px]" style={{ color }} />
        </span>
        {label}
      </>
    );

    if (itemTab) {
      return (
        <button key={id} type="button" onClick={() => openTab(itemTab)} aria-pressed={active} className={className}>
          {body}
        </button>
      );
    }
    return (
      <Link key={id} href={href!} aria-current={active ? "page" : undefined} className={className}>
        {body}
      </Link>
    );
  }

  return (
    <aside
      aria-label="Разделы рабочей области"
      className="sky-night flex w-[88px] shrink-0 flex-col items-center border-r border-white/10 py-4"
    >
      <nav aria-label="Основные разделы" className="flex flex-col items-center gap-1.5">
        {primary.map(renderItem)}
      </nav>
      {/* Служебные пункты прижаты к низу и отделены чертой: их используют реже. */}
      <div className="mt-auto flex flex-col items-center gap-1.5 pt-3">
        <span aria-hidden="true" className="mb-1 h-px w-9 bg-gradient-to-r from-transparent via-[#ffb81c]/50 to-transparent" />
        <MoreSections />
        {renderItem(settings)}
      </div>
    </aside>
  );
}
