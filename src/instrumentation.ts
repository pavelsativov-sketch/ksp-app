/**
 * Next.js instrumentation hook — выполняется один раз при старте сервера.
 * Валидирует конфигурацию fail-fast, чтобы ошибки env ловились до первого запроса.
 */
export async function register() {
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
