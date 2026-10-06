"use client";

import { createContext, useCallback, useContext, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { writeLocaleCookie } from "@/lib/i18n/locale-cookie";
import { dictionaries, type Dict, type Locale } from "@/lib/i18n/dictionaries";

/**
 * Локаль интерфейса как клиентское состояние.
 *
 * Раньше локаль жила только в cookie, а клиентские компоненты читали её один
 * раз из `<html lang>`. Переключение поэтому упиралось в полную перезагрузку
 * страницы. Здесь локаль — обычное React-состояние: клик по переключателю
 * перерисовывает все подписанные компоненты в том же кадре, без навигации.
 *
 * Серверные компоненты обновляются через `router.refresh()` — это запрос
 * RSC-пакета с перерисовкой дерева, без перезагрузки документа и без потери
 * позиции скролла.
 */

interface LocaleContextValue {
  locale: Locale;
  t: Dict;
  /** Мгновенное переключение языка интерфейса. */
  setLocale: (next: Locale) => void;
  /** Пока серверные компоненты не перерисовались новым словарём. */
  isPending: boolean;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [isPending, startTransition] = useTransition();

  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleState(next); // мгновенно: клиентские компоненты перерисуются сейчас
      writeLocaleCookie(next);
      startTransition(() => {
        router.refresh(); // серверные компоненты — тем же словарём, без перезагрузки
      });
    },
    [router],
  );

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, t: dictionaries[locale], setLocale, isPending }),
    [locale, setLocale, isPending],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/**
 * Контекст локали. Возвращает `null`, когда провайдера нет (изолированный
 * рендер компонента в тестах) — тогда `useUiLocale` берёт локаль из DOM.
 */
export function useLocaleContext(): LocaleContextValue | null {
  return useContext(LocaleContext);
}