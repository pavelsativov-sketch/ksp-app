/**
 * Проверка границы «серверный компонент ↔ клиентский хук».
 *
 * Найдено на живом стенде: `quality-gate.tsx` читал локаль интерфейса хуком
 * `useUiLocale`, но не был помечен `"use client"`. Страница плана рендерила
 * его на сервере и отдавала 500 — то есть урок, чертёж урока, презентация и
 * КТП были недоступны целиком. Юнит-тесты это не ловили: компонент
 * отрисовывался в jsdom как обычная функция.
 *
 * Правило проверки простое: файл, который вызывает клиентский хук, обязан
 * объявлять себя клиентским. Никакой другой способ узнать границу в рантайме
 * не работает — ошибка возникает только при серверном рендере.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

/** Хуки, которые доступны только в клиентском компоненте. */
const CLIENT_HOOKS = [
  "useState",
  "useEffect",
  "useLayoutEffect",
  "useTransition",
  "useCallback",
  "useMemo",
  "useRef",
  "useContext",
  "useReducer",
  "useUiLocale",
  "useLocaleContext",
];

/** Все .tsx под src. */
function tsxFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const info = statSync(path);
    if (info.isDirectory()) found.push(...tsxFiles(path));
    else if (path.endsWith(".tsx")) found.push(path);
  }
  return found;
}

describe("клиентские хуки только в клиентских компонентах", () => {
  it.each(CLIENT_HOOKS)("файлы с %s объявляют 'use client'", (hook) => {
    const offenders: string[] = [];
    for (const file of tsxFiles(SRC)) {
      const source = readFileSync(file, "utf8");
      if (!new RegExp(`\\b${hook}\\s*\\(`).test(source)) continue;
      // Само объявление директивы не считается вызовом.
      const isClient = /^\s*["']use client["']/.test(source);
      if (!isClient) offenders.push(file.replace(`${process.cwd()}\\`, ""));
    }
    expect(
      offenders,
      `${hook} вызывается в серверных компонентах — страница упадёт в 500:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("проверка действительно находит нарушения, а не молчит", () => {
    // Самопроверка правила: если регулярка перестанет видеть хуки, тест выше
    // станет бессмысленным и будет молча зелёным.
    const sample = "const [a, b] = useState(1);\nuseEffect(() => {}, []);";
    expect(new RegExp("\\buseState\\s*\\(").test(sample)).toBe(true);
    expect(new RegExp("\\buseEffect\\s*\\(").test(sample)).toBe(true);
    expect(/^\s*["']use client["']/.test("'use client'\n" + sample)).toBe(true);
    expect(/^\s*["']use client["']/.test(sample)).toBe(false);
  });
});