"use client";

import { useState } from "react";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import { dictionaries, isLocale, type Dict, type Locale } from "@/lib/i18n/dictionaries";

/**
 * Локаль для клиентских компонентов.
 *
 * Основной источник — контекст `LocaleProvider`: он реактивен, поэтому смена
 * языка перерисовывает компонент сразу, без перезагрузки страницы.
 *
 * Фолбэк на `<html lang>` нужен для мест, где провайдера нет (изолированный
 * рендер в юнит-тестах). Он читается один раз: значение, выставленное
 * сервером, отражает словарь, которым реально отрисована страница, и не должно
 * меняться на клиенте само по себе — иначе возник бы hydration mismatch.
 */
function readDocumentLocale(): Locale {
  if (typeof document === "undefined") return "ru";
  const lang = document.documentElement.lang;
  if (isLocale(lang)) return lang;
  try {
    const m = document.cookie.match(/(?:^|;\s*)locale=([^;]*)/);
    const value = m ? decodeURIComponent(m[1]) : "";
    if (isLocale(value)) return value;
  } catch {
    // ignore — ниже безопасный дефолт
  }
  return "ru";
}

/** Локаль интерфейса в клиентских компонентах. */
export function useUiLocale(): { locale: Locale; t: Dict } {
  const ctx = useLocaleContext();
  const [documentLocale] = useState<Locale>(readDocumentLocale);
  const locale = ctx?.locale ?? documentLocale;
  return { locale, t: dictionaries[locale] };
}