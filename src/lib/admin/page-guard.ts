import "server-only";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminError, requireAdmin } from "./auth";

const ROBOTS = { index: false, follow: false };

/** Заголовок админки виден только админу: остальные получают общий заголовок сайта. */
export function adminMetadata(title: string): () => Promise<Metadata> {
  return async () => {
    try {
      await requireAdmin();
      return { title, robots: ROBOTS };
    } catch {
      return { robots: ROBOTS };
    }
  };
}

/** Страницы админки: гость — на вход, не-админ и неизвестный id — 404; иначе текст ошибки. */
export function adminPageError(error: unknown, next: string): string {
  if (error instanceof AdminError && error.status === 401) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (error instanceof AdminError && (error.status === 403 || error.status === 404)) notFound();
  return error instanceof AdminError ? error.message : "Данные временно недоступны. Попробуйте позже.";
}
