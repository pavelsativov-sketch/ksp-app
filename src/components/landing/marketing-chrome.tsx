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
export function MarketingChrome({
  chrome,
  content,
  footer,
}: {
  chrome: React.ReactNode;
  content: React.ReactNode;
  footer: React.ReactNode;
}) {
  const pathname = usePathname();
  const appShell = pathname === "/school" || pathname.startsWith("/school/");

  if (appShell) return <>{content}</>;

  return (
    <>
      {chrome}
      {content}
      {footer}
    </>
  );
}
