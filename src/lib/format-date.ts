import type { Locale } from "@/lib/i18n/dictionaries";

/**
 * Дата для серверных страниц: сервер (Vercel) живёт в UTC, поэтому без явного
 * часового пояса после 19:00 по Алматы показывался вчерашний день.
 */
export function formatDateAlmaty(value: Date | string | number, locale: Locale): string {
  return new Date(value).toLocaleDateString(locale === "kk" ? "kk-KZ" : "ru-RU", { timeZone: "Asia/Almaty" });
}
