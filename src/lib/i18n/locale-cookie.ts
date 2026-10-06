/**
 * Cookie локали — общий код для клиентских компонентов.
 *
 * Вынесен отдельно от `locale-provider`, потому что запись в `document.cookie`
 * и `document.documentElement.lang` нельзя выполнять в теле React-компонента
 * (правило react-hooks/immutability), а читать локаль нужно и вне провайдера.
 */
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./dictionaries";

/** Текущая локаль из cookie. Без `document` (SSR) возвращает дефолт. */
export function readLocaleCookie(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)`));
  const value = match ? decodeURIComponent(match[1]) : "";
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Сохраняет локаль на год и синхронизирует язык документа. */
export function writeLocaleCookie(code: Locale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = code;
  document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=31536000; SameSite=Lax`;
}