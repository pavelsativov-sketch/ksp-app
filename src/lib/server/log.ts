/**
 * Structured logger for Cloudflare Workers.
 *
 * Emits JSON lines so Cloudflare's tail/observability can index them by
 * field. Use these instead of bare `console.error(...)` so log search by
 * `endpoint` / `userId` / `event` works.
 *
 *   logEvent("ai.generate.error", { userId, endpoint, errorMessage })
 *   logEvent("ai.generate.ok",    { userId, durationMs })
 */

type LogLevel = "info" | "warn" | "error";

export interface LogContext {
  [key: string]: unknown;
}

function emit(level: LogLevel, event: string, ctx: LogContext): void {
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    event,
    ...ctx,
  });
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export function logEvent(event: string, ctx: LogContext = {}): void {
  emit("info", event, ctx);
}

export function logWarn(event: string, ctx: LogContext = {}): void {
  emit("warn", event, ctx);
}

export function logError(event: string, ctx: LogContext = {}): void {
  emit("error", event, ctx);
}

/** Best-effort timer; returns elapsed ms since `start`. */
export function elapsedMs(start: number): number {
  return Math.max(0, Math.round(Date.now() - start));
}
