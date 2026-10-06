"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "mekty:theme";
type Theme = "light" | "dark";

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
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

/**
 * Переключатель темы.
 *
 * Скрипт в <head> (см. layout) ставит тему до отрисовки, поэтому здесь мы
 * только синхронизируем состояние с уже применённым значением и пишем
 * выбор учителя в localStorage.
 */
export function ThemeToggle() {
  // Значение с диска — источник истины, а не дефолт: сервер о нём не знает.
  const [theme, setTheme] = useState<Theme>("light");
  // Первичная синхронизация — на этапе рендера, а не в эффекте: правило
  // react-hooks запрещает setState внутри эффекта.
  const [synced, setSynced] = useState(false);
  if (!synced) {
    const current = readTheme();
    setTheme(current);
    setSynced(true);
  }

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Не смогли сохранить — тема применится только до перезагрузки.
    }
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
 * тему «dark» остался бы висеть на <html> (тест ловит это).
 */
export const themeScript = `(function(){try{var s=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});var t=(s==="dark"||s==="light")?s:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");var c=document.documentElement.classList;c.toggle("dark",t==="dark");document.documentElement.style.colorScheme=t;}catch(e){}})();`;
