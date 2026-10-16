/**
 * Аренда жизни (lease) для задач агента.
 *
 * Раннер задачи живёт внутри серверлесс-функции с потолком 300 с. Если
 * функция гибнет — например, пока агент стоит на паузе и ждёт, пока учитель
 * введёт пароль, — статус задачи остаётся `running` навсегда: новые задачи
 * блокируются (AGENT_TASK_ALREADY_RUNNING), а «Передать управление ИИ»
 * ничего не оживляет.
 *
 * Лекарство — сердцебиение: живой раннер обновляет поле `heartbeat_at`
 * задачи (в runner.ts), а на этой аренде судят, жив раннер или нет:
 * последний удар пульса старше STALE_RUNNING_MS — зомби.
 *
 * Порог покрывает самый долгий легальный зазор между ударами пульса:
 * медленный вызов модели + один инструмент (до 90 с) + пауза ждёт не чаще
 * одного удара в 10 секунд.
 */

export const STALE_RUNNING_MS = 180_000;

/**
 * Спит ли `running`-задача? Живой раннер бьёт пульсом, мёртвая функция
 * пульс не обновляет. Документы, созданные до появления пульса, судим по
 * updated_at/created_at — они у зомби старше порога. Документ без временных
 * меток вовсе не старим: не можем доказать смерть — не отнимаем слот.
 */
export function runningTaskIsStale(task: unknown, now: number): boolean {
  const doc = (task ?? {}) as Record<string, unknown>;
  const beat = doc.heartbeat_at ?? doc.updated_at ?? doc.created_at;
  const beatAt = beat instanceof Date ? beat.getTime() : typeof beat === "number" ? beat : null;
  if (beatAt === null) return false;
  return now - beatAt > STALE_RUNNING_MS;
}
