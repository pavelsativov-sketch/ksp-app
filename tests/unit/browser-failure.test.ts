import { describe, expect, it } from "vitest";
import { browserFailure } from "@/lib/agents/browser-failure";

describe("browser service failures", () => {
  it("preserves the Browser Run quota response as HTTP 429", () => {
    const failure = browserFailure({
      message: "Достигнут дневной лимит облачного браузера Cloudflare (10 минут). Он сбрасывается в 00:00 UTC.",
      status: 429,
    });

    expect(failure.status).toBe(429);
    expect(failure.message).toContain("10 минут");
  });

  it("does not mistake the new-session throttle for the daily browser quota", () => {
    const failure = browserFailure({
      message: "Cloudflare временно ограничил создание новой сессии браузера.",
      status: 429,
    });

    expect(failure.status).toBe(429);
    expect(failure.message).toContain("Подождите 20 секунд");
    expect(failure.message).not.toContain("10 минут");
  });

  it("keeps unrelated browser failures as temporary service errors", () => {
    expect(browserFailure(new Error("connection reset")).status).toBe(503);
  });
});
