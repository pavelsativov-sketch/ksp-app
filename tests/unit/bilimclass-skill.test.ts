import { describe, expect, it } from "vitest";
import {
  bilimClassInstructions,
  isBilimClassContext,
} from "@/lib/agents/domain-skills/bilimclass";

describe("playbook агента BilimClass", () => {
  it("включается по запросу о BilimClass", () => {
    expect(isBilimClassContext("Проверь журнал в BilimClass", "about:blank")).toBe(true);
    expect(isBilimClassContext("Открой Билим Класс", "about:blank")).toBe(true);
  });

  it("включается только на домене BilimClass и его поддоменах", () => {
    expect(isBilimClassContext("Проверь журнал", "https://bilimclass.kz/login")).toBe(true);
    expect(isBilimClassContext("Проверь журнал", "https://teacher.bilimclass.kz/" )).toBe(true);
    expect(isBilimClassContext("Обычная задача", "https://bilimclass.kz.attacker.example/")).toBe(false);
    expect(isBilimClassContext("Обычная задача", "https://example.org/")).toBe(false);
  });

  it("даёт агенту инструкции по разделам и безопасным изменениям", () => {
    const prompt = bilimClassInstructions();
    expect(prompt).toContain("календарно-тематическое планирование");
    expect(prompt).toContain("электронный журнал");
    expect(prompt).toContain("Мои СОР/СОЧ");
    expect(prompt).toContain("Чат с учеником");
    expect(prompt).toContain("явного подтверждения");
    expect(prompt).toContain("Не закрывай/не завершай журнал");
    expect(prompt).toContain("не утверждай об успехе");
  });
});
