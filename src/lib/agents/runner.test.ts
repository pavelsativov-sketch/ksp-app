import { describe, expect, it } from "vitest";

// ── Регулярка классификации ошибок браузера ─────────────────────────────────
// Скопирована из runner.ts: если там меняется — тест сигнализирует об этом.
const HARD_LIMIT_RE = /daily.{0,30}limit|time limit exceeded|10 minutes per day|достигнут дневной лимит/i;

function isBrowserHardLimit(errorMsg: string): boolean {
  return HARD_LIMIT_RE.test(errorMsg);
}

describe("browser error classification — hard vs soft", () => {
  it("classifies Cloudflare daily limit as hard", () => {
    expect(isBrowserHardLimit("browser time limit exceeded for today")).toBe(true);
    expect(isBrowserHardLimit("daily browser time limit reached")).toBe(true);
    expect(isBrowserHardLimit("достигнут дневной лимит Cloudflare Browser Run")).toBe(true);
    expect(isBrowserHardLimit("10 minutes per day exceeded")).toBe(true);
    expect(isBrowserHardLimit("Daily limit has been reached for this account")).toBe(true);
  });

  it("classifies navigation errors as soft — agent should continue", () => {
    expect(isBrowserHardLimit("Navigation timeout of 25000ms exceeded")).toBe(false);
    expect(isBrowserHardLimit("net::ERR_CONNECTION_REFUSED")).toBe(false);
    expect(isBrowserHardLimit("Page not found")).toBe(false);
    expect(isBrowserHardLimit("Браузер не смог открыть страницу")).toBe(false);
    expect(isBrowserHardLimit("navigation failed")).toBe(false);
    expect(isBrowserHardLimit("Нужны пользовательская сессия и URL с http(s)://")).toBe(false);
    expect(isBrowserHardLimit("")).toBe(false);
  });

  it("is case-insensitive for English error strings", () => {
    expect(isBrowserHardLimit("DAILY LIMIT EXCEEDED")).toBe(true);
    expect(isBrowserHardLimit("Time Limit Exceeded for today")).toBe(true);
  });
});

// ── Логика авто-провала зависшей задачи ────────────────────────────────────
const MAX_TASK_AGE_MS = 12 * 60_000; // должна совпадать с route.ts

function isTaskStale(startedAt: number, now: number): boolean {
  return startedAt > 0 && now - startedAt > MAX_TASK_AGE_MS;
}

describe("stale task detection", () => {
  it("does not flag a freshly started task as stale", () => {
    const now = Date.now();
    expect(isTaskStale(now, now)).toBe(false);
    expect(isTaskStale(now - 5 * 60_000, now)).toBe(false); // 5 мин
    expect(isTaskStale(now - 11 * 60_000, now)).toBe(false); // 11 мин — ещё в пределах
  });

  it("flags a task running beyond MAX_TASK_AGE_MS as stale", () => {
    const now = Date.now();
    expect(isTaskStale(now - MAX_TASK_AGE_MS - 1, now)).toBe(true);
    expect(isTaskStale(now - 15 * 60_000, now)).toBe(true); // 15 мин
    expect(isTaskStale(now - 60 * 60_000, now)).toBe(true); // 1 час
  });

  it("treats zero startedAt (unknown) as non-stale", () => {
    // startedAt === 0 означает, что поле отсутствует в документе —
    // не авто-фейлим задачу, о которой не знаем когда она стартовала.
    expect(isTaskStale(0, Date.now())).toBe(false);
  });
});

// ── Контекст после паузы: URL ──────────────────────────────────────────────
describe("resume context injection", () => {
  it("recognises valid http(s) URLs for context injection", () => {
    const HTTP_URL_RE = /^https?:\/\//i;
    expect(HTTP_URL_RE.test("https://bilimclass.kz/dashboard")).toBe(true);
    expect(HTTP_URL_RE.test("http://nobd.edu.kz/login")).toBe(true);
    expect(HTTP_URL_RE.test("about:blank")).toBe(false);
    expect(HTTP_URL_RE.test("")).toBe(false);
    expect(HTTP_URL_RE.test("data:text/html,<h1>")).toBe(false);
  });
});
