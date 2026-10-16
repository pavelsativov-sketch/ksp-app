"use client";

import { useClientNow } from "@/components/ksp/hooks/use-client-now";

/**
 * Время публикации «Х мин назад» — но без ошибок гидратации.
 *
 * Прежнее время считалось в момент рендера на обоих концах: на границе
 * минуты между отдачей страницы и гидрацией сервер и браузер давали разные
 * строки, и React падал с ошибкой 418. Теперь до гидрации показывается
 * абсолютная дата — одинаковая на обоих концах, а после гидрации текст
 * становится относительным.
 *
 * Абсолютная дата тоже не отдаётся Intl «как получится»: формат зависел от
 * версии ICU у Node и Chrome. Здесь всё закреплено явно — часовой пояс
 * Казахстана и числовые поля, одинаковые в любой ICU.
 */
/** Все учителя продукта — из Казахстана: страна живёт в одном часовом поясе. */
const KZ_TZ = "Asia/Almaty";

const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function absoluteFormat(iso: string, locale: string): string {
  let formatter = FORMATTERS.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : "ru-RU", {
      timeZone: KZ_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    FORMATTERS.set(locale, formatter);
  }
  return formatter.format(new Date(iso));
}

/** Прежний текст «мин назад» — теперь считает от переданного now. */
function relativeFormat(iso: string, locale: string, now: number): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (locale === "kk") {
    if (minutes < 1) return "жаңа ғана";
    if (minutes < 60) return `${minutes} мин бұрын`;
    if (hours < 24) return `${hours} сағ бұрын`;
    if (days < 30) return `${days} күн бұрын`;
  } else {
    if (minutes < 1) return "только что";
    if (minutes < 60) return `${minutes} мин назад`;
    if (hours < 24) return `${hours} ч назад`;
    if (days < 30) return `${days} дн назад`;
  }
  return absoluteFormat(iso, locale);
}

export function TimeAgo({ iso, locale }: { iso: string; locale: string }) {
  const now = useClientNow();

  return (
    <time dateTime={iso} title={absoluteFormat(iso, locale)}>
      {now === null ? absoluteFormat(iso, locale) : relativeFormat(iso, locale, now)}
    </time>
  );
}
