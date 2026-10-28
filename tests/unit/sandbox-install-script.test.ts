/**
 * Скрипт подготовки песочницы: валидный bash и установка шрифтов.
 *
 * Образ Vercel Sandbox приходит без шрифтов, и Chromium рисовал кириллицу и
 * казахские буквы пустыми «квадратиками» — учитель видел «иероглифы». Скрипт
 * обязан ставить Noto Sans, а ошибка загрузки шрифтов не должна ломать запуск.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

function installScript(): string {
  const source = readFileSync(path.join(process.cwd(), "src/lib/agents/sandbox-browser-service.ts"), "utf8");
  const start = source.indexOf("const INSTALL_SCRIPT = `");
  expect(start).toBeGreaterThan(-1);
  const body = source.slice(start + "const INSTALL_SCRIPT = `".length, source.indexOf("`;", start));
  // Вычисляем шаблонную строку так же, как это делает TypeScript.
  return new Function(`return \`${body}\`;`)() as string;
}

const bash = spawnSync("bash", ["--version"], { encoding: "utf8" });
const hasBash = bash.status === 0;

describe("INSTALL_SCRIPT песочницы", () => {
  it.skipIf(!hasBash)("синтаксически корректный bash (bash -n)", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mekty-install-"));
    const file = path.join(dir, "install.sh");
    writeFileSync(file, installScript(), "utf8");
    try {
      const result = spawnSync("bash", ["-n", file], { encoding: "utf8" });
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ставит Noto Sans (кириллица и казахские буквы) и обновляет кэш шрифтов", () => {
    const script = installScript();
    expect(script).toContain("NotoSans-Regular");
    expect(script).toContain("NotoSans-Bold");
    expect(script).toContain("$HOME/.fonts");
    expect(script).toContain("fc-cache");
  });

  it("сбой загрузки шрифтов не мешает признаку готовности браузера", () => {
    const script = installScript();
    // Готовность определяют только маркеры Playwright и системных библиотек.
    const verdict = script.slice(script.lastIndexOf('if [ -f "$READY" ]'));
    expect(verdict).toContain('"$DEPS"');
    expect(verdict).not.toContain('"$FONTS"');
  });

  it("раннер и браузер запускаются в UTF-8 с русской локалью", () => {
    const service = readFileSync(path.join(process.cwd(), "src/lib/agents/sandbox-browser-service.ts"), "utf8");
    expect(service).toContain("LANG=C.UTF-8");
    const runner = readFileSync(path.join(process.cwd(), "src/lib/agents/sandbox-runner-code.ts"), "utf8");
    expect(runner).toContain('locale: "ru-RU"');
  });
});
