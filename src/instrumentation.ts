/**
 * Next.js instrumentation hook — выполняется один раз при старте сервера.
 * Валидирует конфигурацию fail-fast, чтобы ошибки env ловились до первого запроса,
 * и включает трассировку Respan для LLM-вызовов.
 */

/**
 * Respan подключается к серверным LLM-клиентам (openai и другим SDK) и шлёт
 * трейсы в Respan. Без RESPAN_API_KEY функция ничего не делает: локальная
 * разработка и CI работают ровно как раньше.
 *
 * Клиенты моделей не перенаправляются: меняется только наблюдаемость.
 */
async function initRespanTracing() {
  if (!process.env.RESPAN_API_KEY) return;
  try {
    const { Respan } = await import("@respan/respan");
    const respan = new Respan();
    await respan.initialize();
  } catch (error) {
    // Трассировка не должна мешать серверу подняться: без неё приложение работает.
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[respan] Трассировка не включена: ${reason}`);
  }
}

export async function register() {
  // Respan — только Node-рантайм: в Edge-роутах серверных LLM-клиентов нет,
  // а OTEL-инструментация там не работает.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await initRespanTracing();
  }

  // Динамический импорт, чтобы instrumentation не тянул серверные модули в bundler-граф раньше времени.
  const { validateEnv } = await import("@/lib/env");
  const report = validateEnv();
  for (const problem of report.problems) {
    console.error(`[env] ${problem}`);
  }
  if (report.problems.length > 0 && process.env.NODE_ENV === "production") {
    // В проде конфигурационные ошибки должны быть видимыми сразу.
    console.error("[env] Конфигурация неполна — часть функций будет недоступна.");
  }
  if (!report.aiConfigured) {
    console.warn("[env] AI-провайдеры не настроены — AI-генерация недоступна; приложение покажет ошибку конфигурации вместо поддельного результата.");
  }
}
