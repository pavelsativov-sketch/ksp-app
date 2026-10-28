/**
 * Где работает ОС агентов: только в персональной Vercel Sandbox.
 *
 * Терминал, файлы и браузер агента живут в изолированной песочнице на стороне
 * Vercel. Интеграции с компьютером пользователя нет и быть не должно: ни
 * запуска команд на его машине, ни Chromium на его ПК, ни внешнего раннера за
 * туннелем. Вне Vercel (например, при `npm run dev`) рабочей области просто
 * нет, и интерфейс честно говорит об этом.
 *
 * Модуль чистый (без БД, сети и серверных импортов): его можно проверять
 * таблично и подключать откуда угодно.
 */
type Env = Record<string, string | undefined>;

/** Режим для плашки интерфейса. Другого, кроме облака Vercel, не существует. */
export type AgentRuntimeMode = "vercel";
/** Где выполняются команды и лежат файлы рабочей области. */
export type WorkspaceTarget = "vercel-sandbox" | "none";
/** Откуда берётся браузер агента. */
export type BrowserTarget = "vercel-sandbox" | "none";

export function isVercelEnvironment(env: Env = process.env): boolean {
  return env.VERCEL === "1";
}

export function getAgentRuntimeMode(): AgentRuntimeMode {
  return "vercel";
}

export function getWorkspaceTarget(env: Env = process.env): WorkspaceTarget {
  if (env.WORKSPACE_RUNTIME === "off") return "none";
  if (isVercelEnvironment(env) || env.WORKSPACE_RUNTIME === "vercel-sandbox") return "vercel-sandbox";
  return "none";
}

export function getBrowserTarget(env: Env = process.env): BrowserTarget {
  return isVercelEnvironment(env) ? "vercel-sandbox" : "none";
}

/** Переменные, которыми раньше включалась интеграция с компьютером пользователя. */
const REMOVED_LOCAL_VARS = ["AGENT_RUNTIME", "AGENT_LOCAL_RUNNER_URL", "AGENT_LOCAL_WORKSPACE_DIR", "BROWSER_RPC_URL", "BROWSER_RPC_SECRET", "RUNNER_PORT"] as const;

/** Проблемы настройки, которые стоит показать при старте и в проверке перед деплоем. */
export function agentRuntimeProblems(env: Env = process.env): string[] {
  const problems: string[] = [];
  for (const name of REMOVED_LOCAL_VARS) {
    if (env[name]?.trim()) {
      problems.push(`${name} задан, но больше не используется: рабочая область работает только в Vercel Sandbox — удалите переменную`);
    }
  }
  return problems;
}

/**
 * Что сказать, когда рабочей области нет. На Vercel причина в настройке Sandbox,
 * вне Vercel рабочая область недоступна по определению.
 */
export function workspaceUnavailableMessage(env: Env = process.env): string {
  if (isVercelEnvironment(env)) {
    return "Рабочая область недоступна: на сайте не включён Vercel Sandbox. Проверьте настройки проекта.";
  }
  return "Рабочая область работает только на опубликованном сайте (в облаке Vercel Sandbox). При локальном запуске она недоступна.";
}
