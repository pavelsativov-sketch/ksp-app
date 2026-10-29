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

  it("описывает порядок работы с любым разделом и типовые поручения", () => {
    const prompt = bilimClassInstructions();
    // Общий порядок: прочитать или изменить, фильтры, прокрутка, проверка результата.
    expect(prompt).toContain("общий порядок для ЛЮБОГО поручения");
    expect(prompt).toContain("browserScroll");
    expect(prompt).toContain("browserWait");
    expect(prompt).toContain("browserPressKey Escape");
    // Разделы и операции.
    for (const phrase of ["«Журнал» (/2026/control/journal/groups)", "Оценка:", "Посещаемость:", "Массовые изменения", "«Мои СОР/СОЧ» (/2026/content/lessons)", "«Мои уроки» (/2026/content/lectures)", "«Моё расписание» (/2026/schedule)", "«Чат с учеником» (/2026/control/chat)", "Отчёты, мониторинг и аналитика"]) {
      expect(prompt, `нет раздела: ${phrase}`).toContain(phrase);
    }
  });

  it("не отходит от правил безопасности: подтверждения, чужие данные, вход", () => {
    const prompt = bilimClassInstructions();
    expect(prompt).toContain("ОТПРАВКА сообщения — только по явной просьбе");
    expect(prompt).toContain("дождись подтверждения");
    expect(prompt).toContain("не вводи логин, пароль и коды");
    expect(prompt).toContain("Не вноси оценки и посещаемость, которых учитель не называл");
    expect(prompt).toContain("Не копируй персональные данные учеников");
  });

  it("нумерация разделов идёт подряд и ссылки на разделы существуют", () => {
    const prompt = bilimClassInstructions();
    const numbers = [...prompt.matchAll(/^(\d)\. /gm)].map((m) => Number(m[1]));
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6]);
    expect(prompt).toContain("правилам подтверждения из раздела 6");
  });
});
