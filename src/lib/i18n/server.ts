import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  dictionaries,
  isLocale,
  LOCALE_COOKIE,
  type Dict,
  type Locale,
} from "./dictionaries";

export type { Dict, Locale };
export { LOCALES } from "./dictionaries";

/** Локаль интерфейса из cookie (дефолт — ru). */
export async function getLocale(): Promise<Locale> {
  try {
    const value = (await cookies()).get(LOCALE_COOKIE)?.value;
    if (isLocale(value)) return value;
  } catch {
    // cookies недоступны (например, в некоторых тестах) — дефолт
  }
  return DEFAULT_LOCALE;
}

export async function getDict(): Promise<{ locale: Locale; t: Dict }> {
  const locale = await getLocale();
  return { locale, t: dictionaries[locale] };
}
