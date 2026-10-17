import { describe, expect, it } from "vitest";
import { STALE_RUNNING_MS, resolveControlOwner, runningTaskIsStale } from "@/lib/agents/lease";

// ── Сцена из живого прогона (hv10, прод) ──────────────────────────────────
// Агент дошёл до формы входа и встал на паузу; учитель заполнял форму
// дольше пяти минут — серверлесс-функция раннера умерла по лимиту,
// статус остался «running» и новые задачи навсегда получали 409.

const NOW = 1_800_000_000_000;

describe("аренда жизни задачи агента (lease.ts)", () => {
  it("свежий пульс — задача жива, слот не отнимаем", () => {
    expect(runningTaskIsStale({ heartbeat_at: new Date(NOW - 5_000) }, NOW)).toBe(false);
    // 10 секунд — как реже всего пульсирует пауза в waitForControl
    expect(runningTaskIsStale({ heartbeat_at: new Date(NOW - 10_000) }, NOW)).toBe(false);
  });

  it("пульс старше порога — раннер мёртв, задача зомби", () => {
    expect(runningTaskIsStale({ heartbeat_at: new Date(NOW - STALE_RUNNING_MS - 1) }, NOW)).toBe(true);
    expect(runningTaskIsStale({ heartbeat_at: new Date(NOW - 10 * 60_000) }, NOW)).toBe(true);
  });

  it("ровно на пороге — ещё живы (строгое «больше»)", () => {
    expect(runningTaskIsStale({ heartbeat_at: new Date(NOW - STALE_RUNNING_MS) }, NOW)).toBe(false);
  });

  it("старый документ без пульса судим по updated_at (иначе зомби навечно держит слот)", () => {
    const created = new Date(NOW - 60 * 60_000); // час назад
    expect(runningTaskIsStale({ updated_at: created, created_at: created }, NOW)).toBe(true);
    // документ до развёртывания пульса, созданный только что: старых меток
    // нет, а updated_at свежий — судим по нему и не отнимаем слот
    expect(runningTaskIsStale({ updated_at: new Date(NOW - 30_000), created_at: new Date(NOW - 30_000) }, NOW)).toBe(false);
  });

  it("без временных меток вовсе — не старим (не можем доказать смерть)", () => {
    expect(runningTaskIsStale({}, NOW)).toBe(false);
  });

  it("живая пауза учителя (10 минут) остаётся живой: пульс бьётся из waitForControl", () => {
    // Учитель 10 минут вводит пароль: пульс бьётся каждые 10 секунд,
    // последняя метка — 9 секунд назад. Задачу нельзя трогать.
    const beat = new Date(NOW - 9_000);
    expect(runningTaskIsStale({ heartbeat_at: beat }, NOW)).toBe(false);
  });

  it("порог покрывает легальный зазор: модель + инструмент + пауза", () => {
    // Худший легальный зазор: медленный вызов модели (~2 мин суммарно
    // со следующими шагами). Порог 3 минуты обязан его переживать.
    expect(STALE_RUNNING_MS).toBeGreaterThanOrEqual(2.5 * 60_000);
  });
});

// ── Сцена из пользовательского прогона школьной ОС (прод) ──────────────────
// После завершённой задачи агента панель верхнего рельса продолжала гореть
// «AI РАБОТАЕТ» и предлагать «Забрать управление себе»: в базе не было строки
// вовсе, а отсутствующая запись читалась как «владеет ИИ».
describe("владение рабочей областью (resolveControlOwner)", () => {
  it("без строки в базе управляет учитель, а не ИИ", () => {
    expect(resolveControlOwner(undefined, false)).toBe("user");
    expect(resolveControlOwner(undefined, true)).toBe("user");
  });

  it("протухшая запись «ИИ» без живой задачи возвращается учителю", () => {
    // Раннер погиб по таймауту серверлесс-функции: задачи нет, а запись осталась.
    expect(resolveControlOwner("ai", false)).toBe("user");
  });

  it("с живой задачей управление остаётся у ИИ", () => {
    expect(resolveControlOwner("ai", true)).toBe("ai");
  });

  it("учитель может забрать управление и при живой задаче (пауза на входе)", () => {
    expect(resolveControlOwner("user", true)).toBe("user");
  });
});
