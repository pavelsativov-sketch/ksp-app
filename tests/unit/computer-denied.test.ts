import { describe, expect, it, vi } from "vitest";

import { deniedLabel, describeError } from "@/lib/agents/computer/loop";
import type { ProposedAction } from "@/lib/agents/computer/loop";

/**
 * Агент не повторяет отклонённое действие.
 *
 * Оба бага этой группы нашлись живым прогоном, а не чтением кода: агент
 * после отказа на «Войти» предлагал тот же клик ещё раз (учителю пришлось бы
 * трижды жать «Отклонить»), а задача заканчивалась «агент не смог выполнить»
 * — то есть отказ учителя выглядел как технический сбой.
 */

const click = (x: number, y: number): ProposedAction => ({
  name: "click",
  args: { x, y, intent: "нажать Войти" },
  intent: "нажать Войти",
});

/** Повторяется ли действие среди уже отклонённых. */
function isRepeat(action: ProposedAction, denied: Array<{ name: string; label: string }>): boolean {
  return denied.some((d) => d.name === action.name && d.label === deniedLabel(action));
}

describe("повтор отклонённого действия", () => {
  it("тот же клик распознаётся как повтор", () => {
    const first = click(500, 100);
    const denied = [{ name: "click", label: deniedLabel(first) }];
    // Второй запрос подтверждения на то же самое — это давление на учителя.
    expect(isRepeat(click(500, 100), denied)).toBe(true);
  });

  it("другой клик повтором не считается", () => {
    const denied = [{ name: "click", label: deniedLabel(click(500, 100)) }];
    // Агент вправе предложить другое действие — просто не то же самое.
    expect(isRepeat(click(300, 400), denied)).toBe(false);
  });

  it("подпись включает координаты, а не имя инструмента", () => {
    // Итог «вы отклонили действие action.click» не отвечает на вопрос
    // «что именно он хотел нажать».
    const label = deniedLabel(click(500, 100));
    expect(label).toContain("500");
    expect(label).not.toContain("action.click");
  });

  it("подписи разных действий не совпадают", () => {
    expect(deniedLabel({ name: "type", args: { text: "секрет" }, intent: "" })).not.toBe(
      deniedLabel({ name: "navigate", args: { url: "https://a.test" }, intent: "" }),
    );
  });

  it("ввод текста в подписи показывает, что именно", () => {
    expect(deniedLabel({ name: "type", args: { text: "мой пароль" }, intent: "" })).toContain("пароль");
  });

  it("длинный текст в подписи обрезается", () => {
    const label = deniedLabel({ name: "type", args: { text: "а".repeat(300) }, intent: "" });
    expect(label.length).toBeLessThan(80);
  });

  it("неизвестное действие подписывается именем, а не пустотой", () => {
    expect(deniedLabel({ name: "mystery", args: {}, intent: "" })).toBe("mystery");
  });
});

describe("описание сбоя", () => {
  it("строка обрезается: в журнал не попадают стек и внутренние пути", () => {
    const long = new Error("x".repeat(500));
    expect(describeError(long).length).toBe(160);
  });

  it("принимает и не-Error", () => {
    expect(describeError("строка")).toBe("строка");
  });
});
