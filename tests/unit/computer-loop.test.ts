import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { parseToolCalls, pruneImages, trimHistory } from "@/lib/agents/computer/loop";
import {
  denormalize,
  normalize,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
} from "@/lib/agents/computer/screen";

/**
 * Цикл агента «Использование компьютера» — части, которые можно проверить
 * без браузера и без сети: разбор ответа модели и перевод координат.
 */

describe("разбор ответа модели", () => {
  it("достаёт действие с координатами и объяснением", () => {
    const { actions } = parseToolCalls({
      tool_calls: [
        {
          id: "1",
          function: {
            name: "click",
            arguments: JSON.stringify({ x: 450, y: 120, intent: "Нажать на поиск" }),
          },
        },
      ],
    });
    expect(actions).toHaveLength(1);
    expect(actions[0]?.name).toBe("click");
    expect(actions[0]?.intent).toBe("Нажать на поиск");
    expect(actions[0]?.args.x).toBe(450);
  });

  it("битый JSON не роняет разбор: действие станет неизвестным", () => {
    // Раньше такой ответ просто падал бы, и учитель увидел бы ошибку 500
    // вместо понятного «агент предложил ерунду».
    const { actions } = parseToolCalls({
      tool_calls: [{ id: "1", function: { name: "click", arguments: "{не json" } }],
    });
    expect(actions).toHaveLength(1);
    expect(actions[0]?.args).toEqual({});
  });

  it("ответ без действий означает «агент закончил»", () => {
    const { actions, text } = parseToolCalls({ content: "Задача выполнена" });
    expect(actions).toHaveLength(0);
    expect(text).toBe("Задача выполнена");
  });

  it("пропускает вызовы без имени функции", () => {
    const { actions } = parseToolCalls({
      tool_calls: [{ id: "1", function: { name: undefined, arguments: "{}" } }],
    });
    expect(actions).toHaveLength(0);
  });

  it("длинное объяснение обрезается", () => {
    const { actions } = parseToolCalls({
      tool_calls: [
        {
          id: "1",
          function: { name: "click", arguments: JSON.stringify({ x: 1, y: 2, intent: "а".repeat(500) }) },
        },
      ],
    });
    expect(actions[0]?.intent.length).toBe(300);
  });
});

describe("размер истории", () => {
  const step = (n: number) => ({
    role: "user" as const,
    content: [{ type: "text" as const, text: `результат хода ${n}` }],
  });

  it("короткая история не меняется", () => {
    const messages = [
      { role: "system" as const, content: "правила" },
      { role: "user" as const, content: [{ type: "text" as const, text: "задача" }] },
      step(1),
    ];
    trimHistory(messages);
    expect(messages).toHaveLength(3);
  });

  it("длинная история обрезается до последних ходов", () => {
    // Найдено живым прогоном: к шестому ходу запрос разросся до 7638
    // входных токенов при лимите Groq 7000, и агент падал с 413.
    const messages = [
      { role: "system" as const, content: "правила" },
      { role: "user" as const, content: [{ type: "text" as const, text: "задача" }] },
      ...Array.from({ length: 20 }, (_, i) => step(i + 1)),
    ];
    const after = trimHistory(messages);

    expect(after).toBeLessThan(messages.length + 20);
    expect(after).toBeLessThanOrEqual(2 + 1 + 6);
  });

  it("задача и правила остаются в истории", () => {
    // Обрезать исходную задачу нельзя: агент должен помнить, что делает.
    const messages = [
      { role: "system" as const, content: "правила агента" },
      { role: "user" as const, content: [{ type: "text" as const, text: "задача: открыть КСП" }] },
      ...Array.from({ length: 20 }, (_, i) => step(i + 1)),
    ];
    trimHistory(messages);
    expect(messages[0]?.content).toBe("правила агента");
    expect(JSON.stringify(messages[1]?.content)).toContain("открыть КСП");
  });

  it("последние ходы сохраняются", () => {
    const messages = [
      { role: "system" as const, content: "правила" },
      { role: "user" as const, content: [{ type: "text" as const, text: "задача" }] },
      ...Array.from({ length: 20 }, (_, i) => step(i + 1)),
    ];
    trimHistory(messages);
    // Свежий экран агент терять не должен.
    expect(JSON.stringify(messages[messages.length - 1]?.content)).toContain("результат хода 20");
  });

  it("пропуск старых ходов помечен для модели", () => {
    const messages = [
      { role: "system" as const, content: "правила" },
      { role: "user" as const, content: [{ type: "text" as const, text: "задача" }] },
      ...Array.from({ length: 20 }, (_, i) => step(i + 1)),
    ];
    trimHistory(messages);
    // Метка нужна, чтобы модель не решила, что всё началось внезапно.
    expect(JSON.stringify(messages)).toContain("опущено");
  });
});

describe("история снимков", () => {
  const imagePart = { type: "image_url" as const, image_url: { url: "data:image/jpeg;base64,AAA" } };

  it("оставляет не больше двух последних снимков", () => {
    // Проверено вживую: Groq отвечает «Too many images provided. This model
    // supports up to 3 images», и цикл падал на четвёртом шаге.
    const messages = [
      { role: "user" as const, content: [{ type: "text" as const, text: "шаг 1" }, imagePart] },
      { role: "user" as const, content: [{ type: "text" as const, text: "шаг 2" }, imagePart] },
      { role: "user" as const, content: [{ type: "text" as const, text: "шаг 3" }, imagePart] },
    ];
    pruneImages(messages);

    const all = messages.flatMap((m) =>
      Array.isArray(m.content) ? m.content.filter((p) => p.type === "image_url") : [],
    );
    expect(all).toHaveLength(2);
  });

  it("удаляет старые кадры, сохраняя текст хода", () => {
    // Иначе модель потеряла бы само действие: снимок ушёл, а факт клика
    // должен остаться в истории.
    const messages = [
      { role: "user" as const, content: [{ type: "text" as const, text: "нажата кнопка" }, imagePart] },
      { role: "user" as const, content: [{ type: "text" as const, text: "ещё шаг" }, imagePart] },
      { role: "user" as const, content: [{ type: "text" as const, text: "свежий экран" }, imagePart] },
    ];
    pruneImages(messages);

    // Свежий экран обязан уцелеть: считаем от конца истории. Убирается кадр
    // самого раннего шага — на нём агент уже ничего не делает.
    const first = messages[0]!.content;
    expect(
      Array.isArray(first) ? first.some((p) => p.type === "text" && p.text.includes("снимок")) : false,
      "первый (самый старый) снимок должен быть убран",
    ).toBe(true);
    // Факт действия сохраняется: текст хода модели нужен для разбора.
    expect(
      Array.isArray(first) ? first.some((p) => p.type === "text" && p.text === "нажата кнопка") : false,
    ).toBe(true);

    const last = messages[2]!.content;
    expect(
      Array.isArray(last) ? last.some((p) => p.type === "image_url") : false,
      "свежий снимок должен остаться",
    ).toBe(true);
  });

  it("строка вместо массива частей не ломает чистку", () => {
    const messages = [{ role: "user" as const, content: "обычный текст" }];
    expect(() => pruneImages(messages)).not.toThrow();
    expect(messages[0]!.content).toBe("обычный текст");
  });

  it("сообщение без снимков не меняется", () => {
    const messages = [{ role: "user" as const, content: [{ type: "text" as const, text: "привет" }] }];
    pruneImages(messages);
    expect(messages[0]!.content).toEqual([{ type: "text", text: "привет" }]);
  });
});

describe("координаты: модель предсказывает 0–999, браузер ждёт пиксели", () => {
  it("левый верхний угол экрана", () => {
    expect(denormalize(0, SCREEN_WIDTH)).toBe(0);
    expect(denormalize(0, SCREEN_HEIGHT)).toBe(0);
  });

  it("правый нижний угол попадает в последний пиксель, а не за экран", () => {
    // Деление на 1000 давало бы 1279.87 → округление до 1280, то есть
    // на один пиксель за вьюпорт: клик уходил бы мимо.
    expect(denormalize(999, SCREEN_WIDTH)).toBe(SCREEN_WIDTH - 1);
    expect(denormalize(999, SCREEN_HEIGHT)).toBe(SCREEN_HEIGHT - 1);
  });

  it("середина экрана — середина вьюпорта", () => {
    expect(denormalize(500, SCREEN_WIDTH)).toBe(Math.round((500 / 999) * (SCREEN_WIDTH - 1)));
  });

  it("координаты вне диапазона обрезаются, а не ломают страницу", () => {
    // Модель иногда возвращает -50 или 1500: это должно бить по краю экрана,
    // а не вызывать ошибку в цикле.
    expect(denormalize(-50, SCREEN_WIDTH)).toBe(0);
    expect(denormalize(1500, SCREEN_WIDTH)).toBe(SCREEN_WIDTH - 1);
  });

  it("обратный перевод возвращает исходное значение", () => {
    for (const value of [0, 100, 250, 500, 750, 999]) {
      expect(normalize(denormalize(value, SCREEN_WIDTH), SCREEN_WIDTH)).toBe(value);
    }
  });

  it("вырожденный размер экрана не даёт деление на ноль", () => {
    expect(denormalize(500, 1)).toBe(0);
    expect(normalize(0, 1)).toBe(0);
  });
});
