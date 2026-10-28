import { describe, expect, it } from "vitest";
import { boundedResult, MAX_TOOL_RESULT_CHARS } from "@/lib/agents/tools/bounded-result";

describe("boundedResult", () => {
  it("маленький результат возвращается как есть", () => {
    const small = { success: true, url: "https://example.com", title: "t", content: "c" };
    expect(boundedResult(small)).toEqual(small);
  });

  it("убирает бинарные данные", () => {
    const result = boundedResult({ success: true, shot: new Uint8Array([1, 2, 3]) });
    expect(result.shot).toBe("[binary data omitted]");
  });

  it("при переполнении сохраняет interactables и authBarrier — без них агент слеп", () => {
    const big = {
      success: true,
      url: "https://school.example/login",
      title: "Вход",
      content: "а".repeat(5000),
      interactables: "[12,34] кнопка Войти\n".repeat(400),
      authBarrier: { requiresUserAction: true, kind: "login", reason: "Нужен вход", domain: "school.example", extra: "x".repeat(5000) },
    };
    const result = boundedResult(big) as unknown as Record<string, unknown>;
    const serialized = JSON.stringify(result);
    expect(serialized.length).toBeLessThanOrEqual(6000);
    expect(typeof result.interactables).toBe("string");
    expect((result.interactables as string).length).toBeGreaterThan(500);
    expect(result.authBarrier).toMatchObject({ requiresUserAction: true, kind: "login", domain: "school.example" });
    expect(result.authBarrier).not.toHaveProperty("extra");
    // Результат остаётся валидным JSON после обрезки в runner (лимит 6000).
    expect(() => JSON.parse(serialized.slice(0, 6000))).not.toThrow();
  });

  it("порог чуть выше лимита тоже сжимается", () => {
    const edge = { success: true, content: "x".repeat(MAX_TOOL_RESULT_CHARS + 10) };
    expect(JSON.stringify(boundedResult(edge)).length).toBeLessThan(MAX_TOOL_RESULT_CHARS);
  });
});
