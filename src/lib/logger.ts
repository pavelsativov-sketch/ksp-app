/**
 * Структурированный логгер.
 *
 * Раньше по проекту было 35 разбросанных `console.error`, которые в
 * serverless-окружении не собирались в одном месте — о поломке узнавали
 * от учителя в мессенджере. Здесь единый формат, уровни, контекст
 * запроса и опциональная отправка в Sentry, если задан DSN.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function minLevel(): Level {
  const raw = (process.env.LOG_LEVEL ?? "").toLowerCase();
  return (["debug", "info", "warn", "error"] as const).find((l) => l === raw) ?? "info";
}

function shouldLog(level: Level): boolean {
  // В проде отладочные сообщения не пишем, чтобы не утонуть в шуме.
  if (process.env.NODE_ENV !== "production" && level === "debug") return true;
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel()];
}

/** Идентификатор сквозного запроса: связывает ошибки одного пользователя. */
let currentRequestId: string | null = null;

export function newRequestId(): string {
  currentRequestId = crypto.randomUUID();
  return currentRequestId;
}

export function requestId(): string | null {
  return currentRequestId;
}

function emit(level: Level, message: string, context?: Record<string, unknown>): void {
  // Модуль может попасть в клиентский бандл через цепочку импортов
  // (например, из общего слоя AI), поэтому проверяем окружение.
  if (typeof window !== "undefined") return;
  if (!shouldLog(level)) return;
  const record = {
    level,
    msg: message,
    ts: new Date().toISOString(),
    ...(currentRequestId ? { requestId: currentRequestId } : {}),
    ...context,
  };
  // Структурированная строка: агрегаторы (Workers Logs, Papertrail) умеют её разбирать.
  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);

  // Sentry отправляем только на ошибках и только если DSN настроен.
  if (level === "error" && process.env.SENTRY_DSN) {
    void sendToSentry(message, context);
  }
}

/**
 * Отправка ошибки в Sentry по DSN через ingest-эндпоинт.
 *
 * Сделано без пакета @sentry/nextjs намеренно: мониторинг не должен быть
 * обязательной зависимостью сборки — без DSN код просто не выполняется.
 */
async function sendToSentry(message: string, context?: Record<string, unknown>): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    // Формат DSN: https://<publicKey>@<host>/<projectId>
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, "");
    if (!projectId) return;
    const envelope = JSON.stringify({
      event_id: crypto.randomUUID().replace(/-/g, ""),
      timestamp: new Date().toISOString(),
      platform: "node",
      level: "error",
      logger: "ksp-app",
      message: { formatted: message },
      extra: context ?? {},
    });
    await fetch(`https://${url.host}/api/${projectId}/store/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=ksp-app/1.0, sentry_key=${url.username}`,
      },
      body: envelope,
    });
  } catch {
    // Ошибка отправки в мониторинг не должна влиять на работу приложения.
  }
}

export const log = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit("error", msg, ctx),
};
