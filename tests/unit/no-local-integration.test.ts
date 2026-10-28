/**
 * Интеграции с компьютером пользователя нет и быть не должно.
 *
 * Рабочая область (терминал, файлы, браузер агента) работает только в Vercel
 * Sandbox. Эти проверки не дают случайно вернуть запуск команд на машине
 * пользователя, Chromium на его ПК или внешний раннер за туннелем.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

describe("нет интеграции с компьютером пользователя", () => {
  it.each([
    "src/lib/workspace/local-runtime.ts",
    "src/lib/agents/local-command-policy.ts",
    "scripts/dev-local.mjs",
    "scripts/local-browser-runner.mjs",
    "scripts/codespace-browser-runner.mjs",
    "scripts/start-local-browser-service.ps1",
    "start-mekty.cmd",
    "LOCAL_BROWSER_RUNNER.md",
  ])("файл %s удалён", (file) => {
    expect(existsSync(path.join(root, file))).toBe(false);
  });

  it("исходники приложения не запускают процессы на машине сервера", () => {
    const offenders = sourceFiles(path.join(root, "src"))
      .filter((file) => /from\s+["'](?:node:)?child_process["']|require\(["'](?:node:)?child_process["']\)/.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(root, file));
    expect(offenders).toEqual([]);
  });

  it("в коде нет следов локального режима и внешнего раннера", () => {
    const forbidden = /makeLocalRuntime|localWorkspaceRoot|isLocalRuntimeRequested|localRunnerUrl|isExternalRunnerUrl|hardDenyReason|needsHighApproval|AGENT_LOCAL_RUNNER_URL|AGENT_LOCAL_WORKSPACE_DIR/;
    // runtime-mode.ts намеренно называет старые переменные: он предупреждает, что их надо удалить.
    const offenders = sourceFiles(path.join(root, "src"))
      .map((file) => path.relative(root, file).replaceAll("\\", "/"))
      .filter((file) => file !== "src/lib/agents/runtime-mode.ts")
      .filter((file) => forbidden.test(readFileSync(path.join(root, file), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("переменные локального режима упоминаются только в проверке настройки", () => {
    const allowed = new Set(["src/lib/agents/runtime-mode.ts"]);
    const offenders = sourceFiles(path.join(root, "src"))
      .map((file) => path.relative(root, file).replaceAll("\\", "/"))
      .filter((file) => !allowed.has(file))
      .filter((file) => /AGENT_RUNTIME|BROWSER_RPC_URL/.test(readFileSync(path.join(root, file), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("в package.json нет скриптов запуска локального режима", () => {
    const scripts = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts as Record<string, string>;
    expect(Object.keys(scripts).filter((name) => /local/i.test(name))).toEqual([]);
    expect(Object.values(scripts).filter((cmd) => /dev-local|local-browser-runner|codespace/i.test(cmd))).toEqual([]);
  });
});
