import { describe, expect, it } from "vitest";
import {
  bilimClassInstructions,
  isBilimClassContext,
} from "@/lib/agents/domain-skills/bilimclass";

describe("playbook агента BilimClass", () => {
  it("включается по запросу о BilimClass, дэшборде и проведении урока", () => {
    expect(isBilimClassContext("Проверь журнал в BilimClass", "about:blank")).toBe(true);
    expect(isBilimClassContext("Открой Билим Класс", "about:blank")).toBe(true);
    expect(isBilimClassContext("Открой дэшборд и поставь что урок проведен", "about:blank")).toBe(true);
    expect(isBilimClassContext("Нужно провести урок за сегодня", "about:blank")).toBe(true);
    expect(isBilimClassContext("Сабақты өткізу", "about:blank")).toBe(true);
  });

  it("включается только на домене BilimClass и его поддоменах", () => {
    expect(isBilimClassContext("Проверь журнал", "https://bilimclass.kz/login")).toBe(true);
    expect(isBilimClassContext("Проверь журнал", "https://www.bilimclass.kz/2026/frontoffice/dashboard")).toBe(true);
    expect(isBilimClassContext("Проверь журнал", "https://teacher.bilimclass.kz/")).toBe(true);
    expect(isBilimClassContext("Обычная задача", "https://bilimclass.kz.attacker.example/")).toBe(false);
    expect(isBilimClassContext("Обычная задача", "https://example.org/")).toBe(false);
  });

  it("даёт агенту инструкции по дэшборду, 3 кнопкам над предметами и проведению урока", () => {
    const prompt = bilimClassInstructions();
    expect(prompt).toContain("/2026/frontoffice/dashboard");
    expect(prompt).toContain("Дэшборд учителя");
    expect(prompt).toContain("Кнопка 1: Перейти в КТП");
    expect(prompt).toContain("Кнопка 2: Перейти в журнал (оценки и проведение)");
    expect(prompt).toContain("Кнопка 3: Перейти в журнал урока");
    expect(prompt).toContain("Провести урок");
    expect(prompt).toContain("Сабақты өткізу");
    expect(prompt).toContain("календарно-тематическое планирование");
    expect(prompt).toContain("электронный журнал");
    expect(prompt).toContain("Мои СОР/СОЧ");
    expect(prompt).toContain("Чат с учеником");
    expect(prompt).toContain("явного подтверждения");
    expect(prompt).toContain("Не закрывай/не завершай журнал");
    expect(prompt).toContain("не утверждай об успехе");
  });
});

