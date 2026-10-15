/** Translate remote browser errors into stable, user-facing API failures. */
export function browserFailure(error: unknown): { message: string; status: number } {
  const detail = error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
      ? error.message
      : String(error);
  const status = typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: unknown }).status
    : undefined;

  if (/browser time limit exceeded for today|daily.{0,20}(browser )?(time )?limit|10 minutes per day|достигнут дневной лимит/i.test(detail)) {
    return {
      message: "Достигнут дневной лимит Cloudflare Browser Run: 10 минут. Он сбрасывается в 00:00 UTC.",
      status: 429,
    };
  }
  if (status === 429 || /rate.?limit|too many browsers|too many requests|ограничил создание новой сессии/i.test(detail)) {
    return {
      message: "Cloudflare временно ограничил создание новой сессии браузера. Подождите 20 секунд или используйте уже открытую сессию.",
      status: 429,
    };
  }
  if (/запускается|подождите|sandbox/i.test(detail)) {
    return {
      message: detail,
      status: 503,
    };
  }
  return { message: "Облачный браузер временно недоступен. Попробуйте ещё раз позже.", status: 503 };
}
