"use client";

import { useLocale } from "@/lib/i18n/use-locale";

export function LocaleSwitcher({ className }: { className?: string }) {
  const [locale, setLocale] = useLocale();
  const base =
    "text-xs font-medium px-2 py-1 rounded transition-colors border";
  const on = "bg-slate-900 text-white border-slate-900";
  const off = "bg-white text-slate-600 hover:bg-slate-100 border-slate-200";
  return (
    <div
      role="group"
      aria-label="Сменить язык интерфейса"
      className={"inline-flex items-stretch gap-0.5 " + (className ?? "")}
    >
      <button
        type="button"
        aria-pressed={locale === "ru"}
        className={`${base} ${locale === "ru" ? on : off} rounded-r-none`}
        onClick={() => setLocale("ru")}
      >
        RU
      </button>
      <button
        type="button"
        aria-pressed={locale === "kz"}
        className={`${base} ${locale === "kz" ? on : off} rounded-l-none`}
        onClick={() => setLocale("kz")}
      >
        KZ
      </button>
    </div>
  );
}
