import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../helpers/fake-mongo";

const db = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof import("../helpers/fake-mongo").fakeDb> }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/mongo", () => ({
  COL: { agentComputerConfirms: "agent_computer_confirms" },
  getDb: () => db.current.getDb(),
}));

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
 * «Оплатить» нажмутся сами. Состояние хранится в Mongo, поэтому ответ учителя
 * доходит до агента даже с другого инстанса функции.
 */

const USER = "u1";
const OTHER = "u2";

const action: ProposedAction = {
  name: "click",
  args: { x: 500, y: 500 },
  intent: "Нажать «Оплатить»",
};
const probe: ElementProbe = { label: "Оплатить", tag: "button", type: "submit", visible: true };
const decision = classifyClick(probe.label);

/** Ждём, пока агент запишет запрос в базу. */
async function firstPendingId(userId: string): Promise<string> {
  await vi.waitFor(async () => { expect(await countPending(userId)).toBeGreaterThan(0); });
  return (await listPending(userId))[0]!.id;
}

const fast = { pollMs: 5 };

beforeEach(() => {
  db.current = fakeDb();
});

describe("ожидание подтверждения", () => {
  it("действие ждёт ответа и выполняется только после «да»", async () => {
    let allowed: boolean | null = null;
    const waiting = waitForConfirmation(USER, action, decision, probe, fast).then((v) => { allowed = v; });

    const id = await firstPendingId(USER);
    // Учитель ещё не ответил — решение не принято.
    await new Promise((r) => setTimeout(r, 30));
    expect(allowed).toBeNull();

    expect(await resolveConfirmation(USER, id, true)).toBe(true);
    await waiting;
    expect(allowed).toBe(true);
  });

  it("явный отказ останавливает действие", async () => {
    const waiting = waitForConfirmation(USER, action, decision, probe, fast);
    await resolveConfirmation(USER, await firstPendingId(USER), false);
    await expect(waiting).resolves.toBe(false);
  });

  it("молчание учителя равно отказу", async () => {
    // Ключевое свойство: без ответа агент не должен продолжать.
    const waiting = waitForConfirmation(USER, action, decision, probe, { timeoutMs: 60, pollMs: 10 });
    await expect(waiting).resolves.toBe(false);
    expect(await listPending(USER)).toHaveLength(0);
  });

  it("учитель не может отвечать за другого", async () => {
    const waiting = waitForConfirmation(USER, action, decision, probe, fast);
    const id = await firstPendingId(USER);
    // Ответ чужого пользователя не должен разблокировать действие.
    expect(await resolveConfirmation(OTHER, id, true)).toBe(false);
    expect(await listPending(USER)).toHaveLength(1);
    expect(await countPending(USER)).toBe(1);

    await cancelAll(USER);
    await expect(waiting).resolves.toBe(false);
  });

  it("повторный ответ на тот же запрос не проходит", async () => {
    const waiting = waitForConfirmation(USER, action, decision, probe, fast);
    const id = await firstPendingId(USER);
    expect(await resolveConfirmation(USER, id, true)).toBe(true);
    // Второй раз — уже нечего подтверждать: двойной клик по «Разрешить» не
    // должен подтвердить следующее действие.
    expect(await resolveConfirmation(USER, id, true)).toBe(false);
    await expect(waiting).resolves.toBe(true);
  });

  it("остановка задачи снимает все ожидания с отказом", async () => {
    const first = waitForConfirmation(USER, action, decision, probe, fast);
    const second = waitForConfirmation(USER, action, decision, probe, fast);
    await vi.waitFor(async () => { expect(await countPending(USER)).toBe(2); });

    await cancelAll(USER);
    // Цикл не должен висеть до таймаута после остановки задачи.
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(false);
    expect(await countPending(USER)).toBe(0);
  });

  it("запрос виден учителю с причиной и подписью элемента", async () => {
    // Без причины и подписи кнопка «Разрешить» была бы бессмысленной.
    const waiting = waitForConfirmation(USER, action, decision, probe, fast);
    await firstPendingId(USER);
    const [request] = await listPending(USER);
    expect(request?.decision.reason).toBe("кнопка оплаты или оформления заказа");
    expect(request?.probe.label).toBe("Оплатить");
    expect(request?.action.intent).toBe("Нажать «Оплатить»");
    await cancelAll(USER);
    await waiting;
  });

  it("ответ приходит через общее хранилище, а не через память процесса", async () => {
    // Агент и ответ учителя — два независимых вызова, связанных только базой:
    // так это работает и на разных инстансах функции.
    const waiting = waitForConfirmation(USER, action, decision, probe, fast);
    const id = await firstPendingId(USER);
    const stored = db.current.collections.get("agent_computer_confirms")!.docs;
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ user_id: USER, status: "pending" });
    await resolveConfirmation(USER, id, true);
    expect(stored[0]).toMatchObject({ status: "allowed" });
    await expect(waiting).resolves.toBe(true);
  });

  it("некорректный идентификатор запроса отклоняется", async () => {
    expect(await resolveConfirmation(USER, "не-идентификатор", true)).toBe(false);
  });
});
