const DAILY_BROWSER_LIMIT = /browser time limit exceeded for today|daily.{0,20}(browser )?(time )?limit|10 minutes per day/i;
const SESSION_RATE_LIMIT = /too many browsers|too many requests|rate.?limit|concurrent browsers|browser instance.{0,30}limit|429/i;

/** Keep Cloudflare's daily usage cap distinct from its short session-creation throttle. */
export function classifyBrowserAcquireError(error, dailyBrowserSecondsUsed = 0) {
  const reason = error instanceof Error ? error.message : String(error);
  if (DAILY_BROWSER_LIMIT.test(reason) || dailyBrowserSecondsUsed >= 10 * 60) {
    return {
      code: "BROWSER_RUN_QUOTA_EXCEEDED",
      status: 429,
      error: "Достигнут дневной лимит облачного браузера Cloudflare (10 минут). Он сбрасывается в 00:00 UTC.",
    };
  }
  if (SESSION_RATE_LIMIT.test(reason)) {
    return {
      code: "BROWSER_RUN_RATE_LIMITED",
      status: 429,
      error: "Cloudflare временно ограничил создание новой сессии браузера. Подождите 20 секунд или используйте уже открытую сессию.",
    };
  }
  return {
    code: "BROWSER_RUN_UNAVAILABLE",
    status: 503,
    error: "Cloudflare Browser Run временно не смог открыть сессию.",
  };
}
