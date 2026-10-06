"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, School, UserRound } from "lucide-react";

const LINKS = [
  { href: "/school", label: "Агент", icon: Bot },
  { href: "/school/dashboard", label: "Школа", icon: School },
  { href: "/school/settings", label: "Профиль", icon: UserRound },
];

/** Верхняя навигация рабочей области. */
export function SchoolNav({ userName, hasSchool }: { userName: string; hasSchool: boolean }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-2.5">
        <Link href="/school" className="editorial-kicker shrink-0">Mektep&nbsp;OS</Link>
        <nav className="flex flex-1 items-center gap-1" aria-label="Рабочая область">
          {LINKS.filter((l) => l.href !== "/school/dashboard" || hasSchool).map(({ href, label, icon: Icon }) => {
            const active = href === "/school" ? pathname === "/school" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  active ? "bg-primary-soft font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="size-4" /> {label}
              </Link>
            );
          })}
        </nav>
        <span className="hidden truncate text-xs text-muted-foreground sm:block">{userName}</span>
        <Link href="/" className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary">
          Выход
        </Link>
      </div>
    </header>
  );
}
