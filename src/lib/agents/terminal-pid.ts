/**
 * PID-файлы команд терминала. Раньше все команды писали в один файл, и «Стоп»
 * убивал последнюю запущенную, а не ту, что остановил учитель.
 */

/** Общий файл старого клиента, который не присылает runId. */
export const LEGACY_PID_FILE = "/tmp/mekty-term.pid";

/** runId попадает в shell-команду, поэтому пропускаем только безопасные символы. */
export function terminalRunId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9-]{8,64}$/.test(value) ? value : null;
}

export function terminalPidFile(runId: string): string {
  return `/tmp/mekty-term-${runId}.pid`;
}

/** Безопасное одиночное экранирование строки для передачи в `exec bash -lc '...'`. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** Команда остановки: свой запуск по runId (включая дочерние процессы), иначе — последний. */
export function terminalStopCommand(runId: string | null): string {
  if (!runId) return `P=$(cat ${LEGACY_PID_FILE} 2>/dev/null); [ -n "$P" ] && { pkill -TERM -P "$P" 2>/dev/null; kill -TERM "$P" 2>/dev/null; }; true`;
  const file = terminalPidFile(runId);
  return `P=$(cat ${file} 2>/dev/null); [ -n "$P" ] && { pkill -TERM -P "$P" 2>/dev/null; kill -TERM "$P" 2>/dev/null; }; rm -f ${file}; true`;
}
