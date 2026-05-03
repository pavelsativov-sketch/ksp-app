"use client";

import { useEffect, useState } from "react";
import { LOCALE_STORAGE_KEY, type Locale, dict } from "./dict";

function readLocale(): Locale {
  if (typeof window === "undefined") return "ru";
  const v = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return v === "kz" ? "kz" : "ru";
}

/** Subscribe to locale changes and rerender on storage events. */
export function useLocale(): [Locale, (next: Locale) => void] {
  const [locale, setLocale] = useState<Locale>("ru");
  useEffect(() => {
    function onStorage(ev: StorageEvent) {
      if (ev.key === LOCALE_STORAGE_KEY) setLocale(readLocale());
    }
    function onChange() {
      setLocale(readLocale());
    }
    // Defer the initial sync so we don't synchronously setState inside the
    // effect body (React 19 / set-state-in-effect rule).
    queueMicrotask(() => setLocale(readLocale()));
    window.addEventListener("storage", onStorage);
    window.addEventListener("ksp:locale", onChange as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("ksp:locale", onChange as EventListener);
    };
  }, []);

  function set(next: Locale) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    window.dispatchEvent(new CustomEvent("ksp:locale"));
    setLocale(next);
  }

  return [locale, set];
}

export function useT() {
  const [locale] = useLocale();
  return function t(key: keyof typeof dict): string {
    return dict[key]?.[locale] ?? dict[key]?.ru ?? key;
  };
}
