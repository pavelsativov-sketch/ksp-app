import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  listPending,
  resolveConfirmation,
  cancelAll,
  countPending,
  waitForConfirmation,
} from "@/lib/agents/computer/confirm";
import { classifyClick } from "@/lib/agents/computer/safety";
import type { ProposedAction } from "@/lib/agents/computer/loop";
import type { ElementProbe } from "@/lib/agents/computer/screen";

/**
 * Подтверждение опасных действий.
 *
 * Проверяется главное свойство: агент не действует без ответа учителя, а
 * отсутствие ответа считается отказом. Если это сломается, «Отправить» или
 * «Оплатить» нажмутся сами.
 */

const USER = "u1";
const OTHER = "u2";

const action: ProposedAction = {
  name: "click",
  args: { x: 500, y: 500 },
  intent: "Нажать «Оплатить»",
};
const probe: ElementProbe = { label: "Оплатить", tag: "button", type: "submit", visible: true };

beforeEach(() => {
  cancelAll(USER);
  cancelAll(OTHER);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ожидание подтверждения", () => {
  it("действие ждёт ответа и выполняется только после «да»", async () => {
    let allowed: boolean | null = null;
    const waiting = waitForConfirmation(USER, action, classifyClick(probe.label), probe).then((v) => {
      allowed = v;
    });

    // Учитель ещё не ответил — решение не принято.
    await Promise.resolve();
    expect(allowed).toBeNull();
    expect(listPending(USER)).toHaveLength(1);

    resolveConfirmation(USER, listPending(USER)[0]!.id, true);
    await waiting;
    expect(allowed).toBe(true);
  });

  it("явный отказ останавливает действие", async () => {
    const waiting = waitForConfirmation(USER, action, classifyClick(probe.label), probe);
    resolveConfirmation(USER, listPending(USER)[0]!.id, false);
    await expect(waiting).resolves.toBe(false);
  });

  it("молчание учителя равно отказу", async () => {
    vi.useFakeTimers();
    const waiting = waitForConfirmation(USER, action, classifyClick(probe.label), probe);
    // Ключевое свойство: без ответа агент не должен продолжать.
    vi.advanceTimersByTime(120_000);
    await expect(waiting).resolves.toBe(false);
    expect(listPending(USER)).toHaveLength(0);
  });

  it("учитель не может отвечать за другого", async () => {
    const waiting = waitForConfirmation(USER, action, classifyClick(probe.label), probe);
    const id = listPending(USER)[0]!.id;
    // Ответ чужого пользователя не должен разблокировать действие.
    expect(resolveConfirmation(OTHER, id, true)).toBe(false);
    expect(listPending(USER)).toHaveLength(1);
    expect(countPending(USER)).toBe(1);

    cancelAll(USER);
    await expect(waiting).resolves.toBe(false);
  });

  it("повторный ответ на тот же запрос не проходит", async () => {
    const waiting = waitForConfirmation(USER, action, classifyClick(probe.label), probe);
    const id = listPending(USER)[0]!.id;
    expect(resolveConfirmation(USER, id, true)).toBe(true);
    // Второй раз — уже нечего подтверждать: двойной клик по «Разрешить» не
    // должен подтвердить следующее действие.
    expect(resolveConfirmation(USER, id, true)).toBe(false);
    await expect(waiting).resolves.toBe(true);
  });

  it("остановка задачи снимает все ожидания с отказом", async () => {
    const first = waitForConfirmation(USER, action, classifyClick(probe.label), probe);
    const second = waitForConfirmation(USER, action, classifyClick(probe.label), probe);
    expect(countPending(USER)).toBe(2);

    cancelAll(USER);
    // Цикл не должен висеть до таймаута после остановки задачи.
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(false);
    expect(countPending(USER)).toBe(0);
  });

  it("запрос виден учителю с причиной и подписью элемента", () => {
    // Без причины и подписи кнопка «Разрешить» была бы бессмысленной.
    void waitForConfirmation(USER, action, classifyClick(probe.label), probe);
    const [request] = listPending(USER);
    expect(request?.decision.reason).toBe("кнопка оплаты или оформления заказа");
    expect(request?.probe.label).toBe("Оплатить");
    expect(request?.action.intent).toBe("Нажать «Оплатить»");
  });
});
