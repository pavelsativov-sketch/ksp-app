/**
 * Состояние запуска агента «Работа с компьютером» живёт в Mongo: стоп и опрос
 * работают с любого инстанса функции, а не только с того, где идёт цикл.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../helpers/fake-mongo";

const db = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof import("../helpers/fake-mongo").fakeDb> }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/mongo", () => ({
  COL: { agentComputerRuns: "agent_computer_runs" },
  getDb: () => db.current.getDb(),
}));

import {
  RUN_STALE_MS,
  beginRun,
  endRun,
  getRunState,
  isRunStopRequested,
  pushRunEvent,
  requestRunStop,
  setRunAuthBarrier,
} from "@/lib/agents/computer/run-state";

const USER = "u1";

beforeEach(() => {
  db.current = fakeDb();
});

describe("состояние запуска", () => {
  it("первый запуск занимает слот, второй живой запуск — нет", async () => {
    expect(await beginRun(USER, "Открой сайт")).toBe(true);
    expect(await beginRun(USER, "Ещё одно")).toBe(false);
    expect((await getRunState(USER))?.goal).toBe("Открой сайт");
  });

  it("слот освобождается после завершения", async () => {
    await beginRun(USER, "Задача");
    await endRun(USER);
    expect((await getRunState(USER))?.active).toBe(false);
    expect(await beginRun(USER, "Новая")).toBe(true);
  });

  it("запуск без пульса дольше порога считается мёртвым и не блокирует новый", async () => {
    const longAgo = new Date(Date.now() - RUN_STALE_MS - 1000);
    await beginRun(USER, "Зависший", longAgo);
    expect((await getRunState(USER))?.active).toBe(false);
    expect(await beginRun(USER, "Новый")).toBe(true);
  });

  it("журнал накапливается и обрезается до последних 200 событий", async () => {
    await beginRun(USER, "Задача");
    for (let i = 0; i < 205; i += 1) await pushRunEvent(USER, { type: "THINK", message: `шаг ${i}` });
    const state = await getRunState(USER);
    expect(state?.events).toHaveLength(200);
    expect(state?.events.at(-1)?.message).toBe("шаг 204");
    expect(state?.events[0]?.message).toBe("шаг 5");
  });

  it("барьер входа сохраняется и снимается", async () => {
    await beginRun(USER, "Задача");
    await setRunAuthBarrier(USER, { requiresUserAction: true, kind: "login", reason: "Нужен вход" });
    expect((await getRunState(USER))?.authBarrier?.kind).toBe("login");
    await setRunAuthBarrier(USER, null);
    expect((await getRunState(USER))?.authBarrier).toBeNull();
  });
});

describe("остановка", () => {
  it("запрос остановки виден циклу через базу", async () => {
    await beginRun(USER, "Задача");
    expect(await isRunStopRequested(USER)).toBe(false);
    expect(await requestRunStop(USER)).toBe(true);
    expect(await isRunStopRequested(USER)).toBe(true);
  });

  it("без активного запуска остановка ничего не меняет", async () => {
    expect(await requestRunStop(USER)).toBe(false);
    await beginRun(USER, "Задача");
    await endRun(USER);
    expect(await requestRunStop(USER)).toBe(false);
    expect(await isRunStopRequested(USER)).toBe(false);
  });

  it("новый запуск начинается без старого запроса остановки", async () => {
    await beginRun(USER, "Первая");
    await requestRunStop(USER);
    await endRun(USER);
    await beginRun(USER, "Вторая");
    expect(await isRunStopRequested(USER)).toBe(false);
  });

  it("пользователи не видят состояние друг друга", async () => {
    await beginRun(USER, "Моя");
    expect(await getRunState("u2")).toBeNull();
    expect(await requestRunStop("u2")).toBe(false);
    expect(await isRunStopRequested("u2")).toBe(false);
  });
});
