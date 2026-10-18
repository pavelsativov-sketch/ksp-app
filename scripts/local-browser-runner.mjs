/**
 * Локальный браузерный runner для рабочей области.
 *
 * Запускается на компьютере владельца и принимает только HMAC-подписанные
 * запросы приложения. Его можно опубликовать через Cloudflare Tunnel без
 * открытия портов роутера. Это бесплатный вариант вместо Vercel Sandbox:
 * компьютер должен быть включён, пока используется вкладка «Браузер».
 *
 * Запуск после загрузки .env.runner:
 *   node scripts/local-browser-runner.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

if (!process.env.BROWSER_RPC_SECRET || process.env.BROWSER_RPC_SECRET.length < 32) {
  throw new Error("Нужен BROWSER_RPC_SECRET длиной не менее 32 символов. Не используйте AUTH_SECRET приложения.");
}

function loadRunnerScript() {
  const file = path.join(process.cwd(), "src", "lib", "agents", "sandbox-runner-code.ts");
  const source = readFileSync(file, "utf8");
  const marker = "RUNNER_SCRIPT = `";
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`В ${file} не найден RUNNER_SCRIPT`);
  const body = source.slice(start + marker.length, source.lastIndexOf("`"));
  const script = new Function(`return \`${body}\`;`)();
  if (!script.includes("verifySignature") || !script.includes("server.listen")) {
    throw new Error("Извлечённый browser runner выглядит неполным");
  }
  return script;
}

const port = process.env.RUNNER_PORT ?? "3111";
const runnerDir = path.join(process.cwd(), "node_modules", ".cache", "mekty-runner");
mkdirSync(runnerDir, { recursive: true });
const runnerFile = path.join(runnerDir, "local-runner.mjs");
writeFileSync(runnerFile, loadRunnerScript(), "utf8");

const child = spawn(process.execPath, [runnerFile], {
  env: { ...process.env, PORT: port },
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exitCode = code ?? 1;
});
