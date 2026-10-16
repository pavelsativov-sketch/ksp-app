import { describe, expect, it } from "vitest";
import { browserFailure } from "@/lib/agents/browser-failure";

/**
 * Браузер ОС живёт в персональной Vercel Sandbox. Раньше здесь ветвились
 * ошибки Cloudflare Browser Run, и учителю показывался текст про дневной
 * лимит чужого сервиса. Тесты фиксируют текущий, честный контракт.
 */
describe("browser service failures", () => {
  it("asks for a new session when the sandbox session expired", () => {
    const failure = browserFailure({
      message: "Session expired or not found",
      status: 410,
    });

    expect(failure.status).toBe(410);
    expect(failure.message).toContain("Обновите сеанс");
  });

  it("passes a warming-up message through so the UI can auto-retry", () => {
    const detail = "Браузер рабочей области запускается. Это занимает около минуты";
    const failure = browserFailure({ message: detail, status: 503 });

    expect(failure.status).toBe(503);
    expect(failure.message).toBe(detail);
  });

  it("explains a rate limit without blaming a third-party vendor", () => {
    const failure = browserFailure({
      message: "Слишком много обращений к браузеру. Подождите минуту и повторите.",
      status: 429,
    });

    expect(failure.status).toBe(429);
    expect(failure.message).toContain("минуту");
    expect(failure.message).not.toContain("Cloudflare");
  });

  it("never mentions Cloudflare in any branch", () => {
    const inputs: Array<[unknown, number]> = [
      [new Error("connection reset"), 503],
      [{ message: "browser time limit exceeded for today" }, 503],
      [{ message: "10 minutes per day", status: 429 }, 429],
      [{ message: "Session expired", status: 410 }, 410],
      [{ message: "Браузер запускается. Подождите." }, 503],
      [new Error(""), 503],
    ];

    for (const [input, status] of inputs) {
      const failure = browserFailure(input);
      expect(failure.status).toBe(status);
      expect(failure.message.toLowerCase()).not.toContain("cloudflare");
    }
  });

  it("keeps unrelated browser failures as temporary service errors", () => {
    expect(browserFailure(new Error("connection reset")).status).toBe(503);
  });
});