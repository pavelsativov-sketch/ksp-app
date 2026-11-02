"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

/**
 * Маркетинговая оболочка сайта (хедер, футер и сообщение о конфигурации).
 *
 * Внутри `/school` живёт собственное приложение на весь экран — топбар с
 * крошками, рельс и рабочая область ОС. Общий хедер и футер там только
 * мешают: страница получала вертикальный скролл и «двойную» шапку.
 *
 * Гейт клиентский, потому что путь знает только клиент, зато SSR и первый
 * клиентский рендер совпадают: `usePathname` возвращает путь сразу.
 */
const CABINET_PATHS = ["/dashboard", "/plans", "/favorites", "/library", "/kits", "/templates", "/textbooks", "/profile", "/gradebook", "/longterm", "/import", "/notifications", "/feedback", "/assignments", "/ai", "/redeem", "/school"];


export function MarketingChrome({
  chrome,
  content,
  footer,
  cabinet,
}: {
  chrome: React.ReactNode;
  content: React.ReactNode;
  footer: React.ReactNode;
  /** Оболочка кабинета вошедшего учителя с тем же содержимым; для гостя её нет. */
  cabinet?: React.ReactNode;
}) {
  const pathname = usePathname();
  if (cabinet && CABINET_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return <>{cabinet}</>;
  if (pathname === "/school" || pathname.startsWith("/school/")) return <>{content}</>;

  return (
    <>
      {chrome}
      {content}
      {footer}
    </>
  );
}
