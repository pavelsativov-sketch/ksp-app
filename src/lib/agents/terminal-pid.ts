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

/** Команда остановки: свой запуск по runId, иначе — последний (старое поведение). */
export function terminalStopCommand(runId: string | null): string {
  if (!runId) return `kill -TERM $(cat ${LEGACY_PID_FILE} 2>/dev/null) 2>/dev/null || true`;
  const file = terminalPidFile(runId);
  return `kill -TERM $(cat ${file} 2>/dev/null) 2>/dev/null; rm -f ${file}; true`;
}
