"use client";

import { useEffect, useState } from "react";
import { LOCALE_STORAGE_KEY, type Locale, dict } from "./dict";
import { setMyLocaleAction } from "@/app/actions/profile";

function readLocaleCache(): Locale | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return v === "kz" ? "kz" : v === "ru" ? "ru" : null;
}

/**
 * Subscribe to locale changes. The client-side `localStorage` value is a
 * fast first-paint cache; the source of truth on a per-user basis is
 * `profiles.preferred_locale` (synced on every change via setMyLocaleAction).
 *
 * `serverInitial` is the locale read on the server during page render —
 * pass it through so the first paint already matches the user's preference
 * without a flash of Russian.
 */
export function useLocale(
  serverInitial?: Locale | null,
): [Locale, (next: Locale) => void] {
  const [locale, setLocale] = useState<Locale>(serverInitial ?? "ru");

  useEffect(() => {
    function onStorage(ev: StorageEvent) {
      if (ev.key === LOCALE_STORAGE_KEY) {
        const v = readLocaleCache();
        if (v) setLocale(v);
      }
    }
    function onChange() {
      const v = readLocaleCache();
      if (v) setLocale(v);
    }

    // First paint: prefer server-supplied profile locale, otherwise fall
    // back to the client cache. If we got both, server wins and we update
    // the cache so other tabs see the same value. Defer with microtask so
    // we don't synchronously setState in the effect body.
    queueMicrotask(() => {
      const cached = readLocaleCache();
      const next: Locale = serverInitial ?? cached ?? "ru";
      setLocale(next);
      if (
        typeof window !== "undefined" &&
        next &&
        cached !== next
      ) {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
      }
    });

    window.addEventListener("storage", onStorage);
    window.addEventListener("ksp:locale", onChange as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("ksp:locale", onChange as EventListener);
    };
  }, [serverInitial]);

  function set(next: Locale) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    window.dispatchEvent(new CustomEvent("ksp:locale"));
    setLocale(next);
    // Best-effort persist to the user's profile so the choice follows them
    // across devices. Anonymous users get a no-op (action returns
    // UNAUTHENTICATED, we ignore).
    void setMyLocaleAction(next).catch(() => undefined);
  }

  return [locale, set];
}

export function useT(serverInitial?: Locale | null) {
  const [locale] = useLocale(serverInitial);
  return function t(key: keyof typeof dict): string {
    return dict[key]?.[locale] ?? dict[key]?.ru ?? key;
  };
}
