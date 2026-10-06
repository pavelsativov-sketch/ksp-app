"use client";

import { useLocaleContext } from "@/components/i18n/locale-provider";
import type { Locale } from "@/lib/i18n/dictionaries";

/**
 * Переключатель RU/ҚЗ.
 *
 * Переключение мгновенное: локаль живёт в React-состоянии, поэтому клиентские
 * компоненты перерисовываются в том же кадре. Полной перезагрузки больше нет —
 * она была нужна только потому, что словарь читался из корневого layout, а он
 * не перерисовывается при клиентской навигации.
 *
 * Локаль на клиенте берётся из контекста, а если провайдера нет (тест) — из
 * cookie: в этом случае компонент ничего не переключает, а отдаёт выбор
 * наружу через колбэк.
 */
export function LocaleSwitcher({
  locale,
  onLocaleChange,
}: {
  locale: Locale;
  onLocaleChange?: (next: Locale) => void;
}) {
  const ctx = useLocaleContext();
  const active = ctx?.locale ?? locale;
  const setLocale = ctx?.setLocale;

  function switchLocale(code: Locale) {
    if (code === active) return;
    if (setLocale) {
      setLocale(code); // мгновенная перерисовка клиентских компонентов
    }
    onLocaleChange?.(code);
  }

  return (
    <div role="group" aria-label="Язык интерфейса / Интерфейс тілі" className="flex items-center gap-1">
      {(["ru", "kk"] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => switchLocale(code)}
          aria-pressed={active === code}
          aria-label={code === "ru" ? "Переключить на русский" : "Қазақ тіліне ауысу"}
          className={`rounded-md px-2 py-1 text-xs font-bold uppercase tracking-wide transition-colors ${
            active === code ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          {code === "ru" ? "РУ" : "ҚЗ"}
        </button>
      ))}
    </div>
  );
}