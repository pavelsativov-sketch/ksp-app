/**
 * Перевод ошибок браузера рабочей области в понятный учителю ответ.
 *
 * Браузер живёт в персональной Vercel Sandbox. Раньше здесь ветвились
 * ошибки Cloudflare Browser Run (дневной лимит 10 минут, троттлинг) —
 * этого бэкенда в проекте больше нет, и учителю показывался текст про
 * чужой сервис, которого он никогда не видел.
 */
export function browserFailure(error: unknown): { message: string; status: number } {
  const detail = error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
      ? error.message
      : String(error);
  const status = typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: unknown }).status
    : undefined;

  // Сессия в песочнице протухла (10 минут без действий) либо её закрыли.
  // Это не поломка: нужен новый сеанс, вкладка умеет переподключаться.
  if (status === 410 || /session expired|сессия истекла|closed/i.test(detail)) {
    return {
      message: "Сеанс браузера завершён. Обновите сеанс, чтобы продолжить с того же места.",
      status: 410,
    };
  }

  // Слишком много запросов к браузеру — это наш собственный rate limit.
  // Проверяем ДО ветки прогрева: текст про «подождите минуту» иначе
  // попал бы в неё вместе со статусом 503 вместо 429.
  if (status === 429 || /rate.?limit|too many requests|слишком много обращений/i.test(detail)) {
    return {
      message: "Слишком много обращений к браузеру. Подождите минуту и повторите.",
      status: 429,
    };
  }

  // Песочница прогревается: первый запуск поднимает Chromium. Текст
  // показываем как есть — вкладка браузера по нему включает автоповтор.
  if (/запускается|устанавливается|не установился|песочниц/i.test(detail)) {
    return { message: detail, status: 503 };
  }

  return {
    message: "Браузер рабочей области временно недоступен. Попробуйте ещё раз через минуту.",
    status: 503,
  };
}