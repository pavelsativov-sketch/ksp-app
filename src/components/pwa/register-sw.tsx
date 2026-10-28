"use client";

import { useEffect } from "react";

export function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Не регистрируем в dev — HMR + SW конфликтуют
    if (process.env.NODE_ENV !== "production") return;
    const url = "/sw.js";
    navigator.serviceWorker.register(url).catch(() => undefined);
  }, []);
  return null;
}
