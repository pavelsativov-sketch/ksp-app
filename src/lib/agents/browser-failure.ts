/**
 * Перевод ошибок браузера рабочей области в понятный учителю ответ.
 *
 * Браузер живёт в персональной Vercel Sandbox. Раньше здесь ветвились
 * ошибки Cloudflare Browser Run (дневной лимит 10 минут, троттлинг) —
 * этого бэкенда в проекте больше нет, и учителю показывался текст про
 * чужой сервис, которого он никогда не видел.
 */
/**
 * Приводит ошибку к читаемому виду.
 *
 * Ошибки здесь приходят от нескольких слоёв: от раннера в песочнице, от
 * serverless-обвязки и от самого браузера. Часть из них — не экземпляры
 * Error, а обычные объекты. Прежнее `String(error)` давало в логе
 * «[object Object]», и по журналу было невозможно понять, что случилось:
 * причина терялась целиком.
 */
export function describeBrowserError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (error && typeof error === "object") {
    const source = error as { message?: unknown; error?: unknown; reason?: unknown };
    const parts = [source.message, source.error, source.reason]
      .filter((value): value is string => typeof value === "string" && value.length > 0);
    if (parts.length) return parts.join(" · ");
    try {
      return JSON.stringify(error).slice(0, 300);
    } catch {
      return "объект ошибки без полей";
    }
  }
  return String(error);
}

export function browserFailure(error: unknown): { message: string; status: number; starting?: boolean } {
  const detail = describeBrowserError(error);
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

  // Это не временная ошибка раннера: Vercel блокирует создание песочницы,
  // пока на аккаунте исчерпан лимит хранилища snapshots. Автоповтор лишь
  // создаёт поток одинаковых запросов и скрывает от учителя реальную
  // причину. Не отдаём исходный текст провайдера и не предлагаем ждать минуту.
  if (status === 402 || /snapshots? storage|usage limit exceeded/i.test(detail)) {
    return {
      message: "Среда ОС недоступна: исчерпан лимит хранилища Vercel Sandbox. Освободите неиспользуемые snapshots или подключите тариф с Sandbox, затем повторите.",
      status: 402,
    };
  }

  // Песочница прогревается: первый запуск поднимает Chromium. Раньше это
  // уходило учителю как 503 — вкладка показывала spinner «Запускаю браузер…»,
  // а в консоли и в логах CDN оставалась красная строка Failed to load
  // resource: 503 при совершенно нормальном состоянии системы. Теперь это
  // ответ «принято, но ещё готовимся» (202): вкладка крутит тот же
  // автоматический повтор, но браузер не считает это ошибкой.
  if (/запускается|устанавливается|не установился|песочниц/i.test(detail)) {
    return { message: detail, status: 202, starting: true };
  }

  return {
    message: "Браузер рабочей области временно недоступен. Попробуйте ещё раз через минуту.",
    status: 503,
  };
}
