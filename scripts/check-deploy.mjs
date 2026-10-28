/**
 * Перед деплоем: в production-конфигурации не должно остаться переменных,
 * которыми раньше включалась интеграция с компьютером пользователя.
 * Рабочая область работает только в Vercel Sandbox.
 */
import { existsSync, readFileSync } from "node:fs";

const files = [".env.production", ".vercel/env.production.local", "vercel.json"];
const removedVars = ["AGENT_RUNTIME", "AGENT_LOCAL_RUNNER_URL", "AGENT_LOCAL_WORKSPACE_DIR", "BROWSER_RPC_URL", "BROWSER_RPC_SECRET", "RUNNER_PORT"];
const problems = [];

for (const file of files) {
  if (!existsSync(file)) continue;
  const text = readFileSync(file, "utf8");
  for (const name of removedVars) {
    if (new RegExp(`(?:^|[\\s,{"'])${name}\\b`, "m").test(text)) problems.push(`${file}: ${name}`);
  }
}

// В CI и на Vercel список production-переменных приходит как реальное окружение.
// На рабочем компьютере разработчика старые переменные могли остаться — это не ошибка деплоя.
if (process.env.CI || process.env.VERCEL) {
  for (const name of removedVars) {
    if (process.env[name]?.trim()) problems.push(`environment: ${name}`);
  }
}

if (problems.length) {
  console.error("Устаревшая конфигурация (локальная интеграция удалена, нужен только Vercel Sandbox):\n" + problems.map((p) => `- ${p}`).join("\n"));
  process.exit(1);
}
console.log("check:deploy: production-конфигурация чистая, рабочая область только в Vercel Sandbox.");
