import "server-only";
import { getDb, COL } from "@/lib/mongo";
import type { LoopEvent } from "./loop";
import type { PageAuthBarrier } from "@/lib/agents/browser-dom";

/**
 * Состояние запуска агента «Работа с компьютером» в Mongo.
 *
 * Раньше оно жило в Map внутри процесса: опрос статуса и кнопка «Остановить»
 * на другом инстансе функции не видели работающего агента. Теперь один документ
 * на пользователя: активность, журнал, барьер входа и запрос остановки.
 */
export const RUN_STALE_MS = 6 * 60_000;
const MAX_EVENTS = 200;

export interface RunState {
  active: boolean;
  goal: string;
  startedAt: number;
  events: LoopEvent[];
  authBarrier: PageAuthBarrier | null;
  stopRequested: boolean;
}

type RunDoc = {
  user_id: string;
  active: boolean;
  goal: string;
  started_at: Date;
  heartbeat_at: Date;
  events: LoopEvent[];
  auth_barrier: PageAuthBarrier | null;
  stop_requested: boolean;
};

async function runs() {
  return (await getDb()).collection<RunDoc>(COL.agentComputerRuns);
}

/** Занять слот запуска. false — у пользователя уже работает живой агент. */
export async function beginRun(userId: string, goal: string, now = new Date()): Promise<boolean> {
  // Одна атомарная операция: занимаем слот, только если он свободен или протух.
  // Занятый живой слот не совпадёт с фильтром, и upsert упрётся в уникальный
  // индекс по user_id (E11000) — это и есть «уже работает».
  try {
    await (await runs()).updateOne(
      {
        user_id: userId,
        $or: [{ active: { $ne: true } }, { heartbeat_at: { $lte: new Date(now.getTime() - RUN_STALE_MS) } }],
      },
      { $set: { active: true, goal: goal.slice(0, 200), started_at: now, heartbeat_at: now, events: [], auth_barrier: null, stop_requested: false } },
      { upsert: true },
    );
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
}

export async function pushRunEvent(userId: string, event: LoopEvent): Promise<void> {
  await (await runs()).updateOne(
    { user_id: userId },
    { $push: { events: { $each: [event], $slice: -MAX_EVENTS } }, $set: { heartbeat_at: new Date() } },
  );
}

export async function setRunAuthBarrier(userId: string, barrier: PageAuthBarrier | null): Promise<void> {
  await (await runs()).updateOne({ user_id: userId }, { $set: { auth_barrier: barrier, heartbeat_at: new Date() } });
}

/** Попросить остановку. false — активного запуска нет. */
export async function requestRunStop(userId: string): Promise<boolean> {
  const result = await (await runs()).updateOne({ user_id: userId, active: true }, { $set: { stop_requested: true } });
  return result.matchedCount > 0;
}

export async function isRunStopRequested(userId: string): Promise<boolean> {
  const doc = await (await runs()).findOne({ user_id: userId }, { projection: { stop_requested: 1, active: 1 } });
  return doc?.active === true && doc.stop_requested === true;
}

export async function endRun(userId: string): Promise<void> {
  await (await runs()).updateOne({ user_id: userId }, { $set: { active: false, heartbeat_at: new Date() } });
}

/** Состояние для опроса из интерфейса. Устаревший «активный» запуск считается завершённым. */
export async function getRunState(userId: string, now = Date.now()): Promise<RunState | null> {
  const doc = await (await runs()).findOne({ user_id: userId });
  if (!doc) return null;
  const alive = doc.active && now - doc.heartbeat_at.getTime() < RUN_STALE_MS;
  return {
    active: alive,
    goal: doc.goal,
    startedAt: doc.started_at.getTime(),
    events: doc.events ?? [],
    authBarrier: doc.auth_barrier ?? null,
    stopRequested: doc.stop_requested === true,
  };
}
