import "server-only";
import { notFound, redirect } from "next/navigation";
import { AdminError } from "./auth";

/** Страницы админки: гость — на вход, не-админ и неизвестный id — 404; иначе текст ошибки. */
export function adminPageError(error: unknown, next: string): string {
  if (error instanceof AdminError && error.status === 401) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (error instanceof AdminError && (error.status === 403 || error.status === 404)) notFound();
  return error instanceof AdminError ? error.message : "Данные временно недоступны. Попробуйте позже.";
}
