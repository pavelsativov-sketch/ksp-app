"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "mekty:theme";
type Theme = "light" | "dark";

const listeners = new Set<() => void>();

function readTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // localStorage может быть недоступен (приватный режим) — не критично.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  // color-scheme дергать не нужно: его ставит CSS самого класса .dark
  // (globals.css), а inline-стиль на <html> помечал бы гидрационный корень.
  document.documentElement.classList.toggle("dark", theme === "dark");
}

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Подписка на источник темы: системная схема (без события storage) и
 * сохранённый выбор учителя (storage-событие приходит только из чужих
 * вкладок, поэтому свои переключения докидываем через notify()).
 */
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  const onMedia = () => listener();
  const onStorage = () => listener();
  media?.addEventListener?.("change", onMedia);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    media?.removeEventListener?.("change", onMedia);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Переключатель темы.
 *
 * Источник истины — useSyncExternalStore. Первый (гидрационный) рендер
 * всегда берёт серверное значение "light", поэтому разметка кнопки
 * совпадает с сервером и гидрация не падает (см. React error #418:
 * сервер рендерил Moon, а тёмный клиент в этом же проходе уже рисовал
 * Sun). После гидрации хранилище отдаёт реальное значение, и кнопка
 * перерисовывается штатным обновлением состояния.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "light");

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    // Сначала запись, потом notify(): подписчиками пересчитывается снапшот
    // (readTheme), и он должен уже видеть новый выбор, иначе React сочтёт
    // значение неизменным и не перерисует кнопку.
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Не смогли сохранить — тема применится только до перезагрузки.
    }
    applyTheme(next);
    notify();
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={toggle}
      aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
      aria-pressed={theme === "dark"}
      title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}

/**
 * Скрипт для <head>: применяет тему до первой отрисовки, без мигания.
 *
 * Класс ставится и снимается симметрично: иначе при переключении на светлую
 * тему «dark» остался бы висеть на <html> (тест ловит это). color-scheme
 * выставлять не нужно — его задаёт CSS класса .dark (globals.css).
 */
export const themeScript = `(function(){try{var s=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});var t=(s==="dark"||s==="light")?s:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");var c=document.documentElement.classList;c.toggle("dark",t==="dark");}catch(e){}})();`;
