"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Bell, BookOpen, Bot, ChartLine, ChevronDown, FileText, CalendarDays, CircleHelp, Home, Menu, MonitorSmartphone, Search, Settings, Star, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import { ThreeStage } from "@/components/three/three-stage";
import { MORE_SECTIONS } from "@/components/school/school-rail";
import { appCopy } from "./copy";
import s from "./app-shell.module.css";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  active: (path: string) => boolean;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "M").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}

/** Оболочка кабинета: шапка с поиском, боковое меню и помощник. Единая для всех рабочих страниц. */
export function AppShell({
  userName,
  userEmail,
  account,
  children,
}: {
  userName: string;
  userEmail: string;
  account: React.ReactNode;
  children: React.ReactNode;
}) {
  const path = usePathname() ?? "/";
  const { locale } = useUiLocale();
  const c = appCopy(locale);
  const [open, setOpen] = useState(false);

  const inSchool = path === "/school" || path.startsWith("/school/");
  const main: NavItem[] = [
    { href: "/dashboard", label: c.nav.home, icon: Home, active: (p) => p === "/dashboard" },
    { href: "/plans/new", label: c.nav.constructor, icon: FileText, active: (p) => p === "/plans/new" },
    { href: "/plans", label: c.nav.plans, icon: CalendarDays, active: (p) => p === "/plans" || (p.startsWith("/plans/") && p !== "/plans/new") },
    { href: "/library", label: c.nav.library, icon: BookOpen, active: (p) => p.startsWith("/library") || p.startsWith("/kits") || p.startsWith("/templates") || p.startsWith("/textbooks") },
    { href: "/school", label: c.nav.agent, icon: Bot, active: (p) => p === "/school" || p.startsWith("/school/agents") || p.startsWith("/school/workspace") },
    { href: "/school/dashboard", label: c.nav.os, icon: MonitorSmartphone, active: (p) => inSchool && p !== "/school" && !p.startsWith("/school/agents") && !p.startsWith("/school/workspace") && !p.startsWith("/school/reports") },
    { href: "/school/reports", label: c.nav.analytics, icon: ChartLine, active: (p) => p.startsWith("/school/reports") },
    { href: "/favorites", label: c.nav.favorites, icon: Star, active: (p) => p.startsWith("/favorites") },
  ];
  const foot: NavItem[] = [
    { href: "/feedback", label: c.nav.help, icon: CircleHelp, active: (p) => p.startsWith("/feedback") },
    { href: "/profile", label: c.nav.settings, icon: Settings, active: (p) => p.startsWith("/profile") },
  ];

  const renderItem = (item: NavItem) => {
    const active = item.active(path);
    const Icon = item.icon;
    return (
      <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={active ? `${s.item} ${s.itemActive}` : s.item} onClick={() => setOpen(false)}>
        <Icon aria-hidden="true" className={s.itemIcon} />
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <div className={s.shell}>
      <header className={`${s.top} no-print`}>
        <button type="button" className={s.burger} aria-label={c.menu} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
        <Link href="/dashboard" className={s.brand}>
          <Image src="/mekty-icon.svg" alt="" width={40} height={40} priority />
          <span className={s.brandCopy}>
            <span className={s.brandName}>Mekty</span>
            <span className={s.brandTag}>{c.cabinet}</span>
          </span>
        </Link>
        <form action="/plans" role="search" className={s.search}>
          <Search aria-hidden="true" className={s.searchIcon} />
          <input name="q" type="search" aria-label={c.searchLabel} placeholder={c.search} className={s.searchInput} />
        </form>
        <div className={s.topActions}>
          <Link href="/notifications" className={s.round} aria-label={c.notifications}><Bell aria-hidden="true" /></Link>
          <Link href="/feedback" className={s.round} aria-label={c.help}><CircleHelp aria-hidden="true" /></Link>
          <details className={s.user}>
            <summary className={s.userButton}>
              <span className={s.avatar}>{initials(userName || userEmail)}</span>
              <span className={s.userCopy}>
                <span className={s.userName}>{userName || userEmail}</span>
                <span className={s.userRole}>{userEmail}</span>
              </span>
              <ChevronDown aria-hidden="true" className={s.userChevron} />
            </summary>
            <div className={s.userMenu}>{account}</div>
          </details>
        </div>
      </header>

      <div className={s.body}>
        <aside className={`${s.side} ${open ? s.sideOpen : ""} no-print`}>
          <nav aria-label={c.menu} className={s.nav}>
            {main.map((item) => (
              <Fragment key={item.href}>
                {renderItem(item)}
                {/* Разделы школы раскрываются под своим пунктом и только внутри него. */}
                {item.href === "/school/dashboard" && item.active(path) && (
                  <div className={s.sub}>
                    {MORE_SECTIONS.map((section) => (
                      <Link key={section.href} href={section.href} aria-current={path.startsWith(section.href) ? "page" : undefined} className={path.startsWith(section.href) ? `${s.subItem} ${s.subItemActive}` : s.subItem} onClick={() => setOpen(false)}>
                        {section.label}
                      </Link>
                    ))}
                  </div>
                )}
              </Fragment>
            ))}
            <hr className={s.rule} />
            {foot.map(renderItem)}
          </nav>
          {/* На экране агента робот уже есть, а в школе меню длиннее: второй не нужен. */}
          {!inSchool && (
            <Link href="/school" className={s.mascot} onClick={() => setOpen(false)}>
              <ThreeStage scene="robot" className={s.mascotModel} />
              <span className={s.mascotTitle}>{c.mascotTitle}</span>
              <span className={s.mascotText}>{c.mascotText}</span>
            </Link>
          )}
        </aside>
        {open && <button type="button" aria-label={c.close} className={s.scrim} onClick={() => setOpen(false)} />}
        <div className={s.content}>{children}</div>
      </div>
    </div>
  );
}
