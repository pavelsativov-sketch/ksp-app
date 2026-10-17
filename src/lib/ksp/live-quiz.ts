/**
 * Протокол live-квиза поверх MongoDB polling (коллекции quiz_rooms/quiz_events).
 *
 * Канал: комната с 6-значным кодом, уникальным в quiz_rooms (TTL 6 часов).
 * Хост пишет host:question/host:reveal/host:end, студенты — student:join/answer.
 * Обе стороны поллят GET /api/quiz/[code]?since=seq каждые ~1.5с.
 *
 * Сообщения от хоста:
 *  - "host:question" → { index, task } (task — без правильных ответов)
 *  - "host:reveal" → { index, correct }
 *  - "host:end" → { leaderboard }
 *
 * Сообщения от ученика:
 *  - "student:join" → { studentId, name }
 *  - "student:answer" → { studentId, index, answer, ms } (ms — время ответа в мс)
 */

import type { InteractiveTask, TaskAnswer } from "./tasks";

export type LivePhase = "lobby" | "question" | "reveal" | "ended";

export interface LiveLeaderboardEntry {
  studentId: string;
  name: string;
  score: number;
  answered: number; // сколько вопросов уже ответили
}

export interface HostState {
  phase: LivePhase;
  currentIndex: number;
  total: number;
  leaderboard: LiveLeaderboardEntry[];
}

export interface HostQuestionMsg {
  index: number;
  /** Task with `correctIndex` / `answer` etc. STRIPPED — клиенты не должны узнать ответ. */
  task: PublicTask;
  endsAt?: number; // unix ms — когда заканчивается таймер
  /**
   * Только для сервера: полная задача с правильными ответами.
   * Сервер сохраняет её в документе комнаты (secretTask) и убирает из событий,
   * которые видят ученики через GET.
   */
  secret?: InteractiveTask;
  /** План-источник — чтобы хост мог продолжить квиз после обновления страницы. */
  planId?: string;
}

/** Состояние комнаты для восстановления сессии хоста (см. /api/quiz/host-room). */
export interface HostResume {
  code: string;
  phase: LivePhase;
  currentIndex: number;
  endsAt: number | null;
  leaderboard: LiveLeaderboardEntry[];
}

export interface HostRevealMsg {
  index: number;
  correctSummary: string;
}

export interface StudentJoinMsg {
  studentId: string;
  name: string;
}

export interface StudentAnswerMsg {
  studentId: string;
  index: number;
  answer: TaskAnswer;
  ms: number;
}

/**
 * Версия задачи без секретов (correctIndex, correctOrder, answer и т.п.) —
 * именно это рассылается ученикам.
 */
export type PublicTask =
  | { id: string; type: "MCQ"; question: string; hint?: string; points: number; timeLimitSec?: number; options: string[] }
  | { id: string; type: "TRUE_FALSE"; question: string; hint?: string; points: number; timeLimitSec?: number }
  | { id: string; type: "SHORT_ANSWER"; question: string; hint?: string; points: number; timeLimitSec?: number }
  | { id: string; type: "FILL_BLANK"; question: string; hint?: string; points: number; timeLimitSec?: number; template: string; blanks: number }
  | { id: string; type: "MATCHING"; question: string; hint?: string; points: number; timeLimitSec?: number; left: string[]; right: string[] }
  | { id: string; type: "ORDERING"; question: string; hint?: string; points: number; timeLimitSec?: number; items: string[] }
  | { id: string; type: "NUMERIC"; question: string; hint?: string; points: number; timeLimitSec?: number; unit?: string };

export function toPublicTask(task: InteractiveTask): PublicTask {
  const base = {
    id: task.id,
    question: task.question,
    hint: task.hint,
    points: task.points,
    timeLimitSec: task.timeLimitSec,
  };
  switch (task.type) {
    case "MCQ":
      return { ...base, type: "MCQ", options: task.options };
    case "TRUE_FALSE":
      return { ...base, type: "TRUE_FALSE" };
    case "SHORT_ANSWER":
      return { ...base, type: "SHORT_ANSWER" };
    case "FILL_BLANK":
      return { ...base, type: "FILL_BLANK", template: task.template, blanks: task.answers.length };
    case "MATCHING":
      return { ...base, type: "MATCHING", left: task.left, right: task.right };
    case "ORDERING":
      return { ...base, type: "ORDERING", items: task.items };
    case "NUMERIC":
      return { ...base, type: "NUMERIC", unit: task.unit };
  }
}

export function correctSummary(task: InteractiveTask): string {
  switch (task.type) {
    case "MCQ":
      return `Правильный ответ: «${task.options[task.correctIndex]}»`;
    case "TRUE_FALSE":
      return `Правильный ответ: ${task.correct ? "Верно" : "Неверно"}`;
    case "SHORT_ANSWER":
      return `Ожидался ответ: «${task.acceptedAnswers[0] ?? ""}»`;
    case "FILL_BLANK":
      return `Пропуски: ${task.answers.map((a) => `«${a}»`).join(", ")}`;
    case "MATCHING":
      return `Соответствия: ${task.pairs
        .map((p) => `${task.left[p.leftIndex]} → ${task.right[p.rightIndex]}`)
        .join("; ")}`;
    case "ORDERING":
      return `Порядок: ${task.correctOrder.map((i) => task.items[i]).join(" → ")}`;
    case "NUMERIC":
      return `Ожидалось: ${task.answer}${task.unit ? ` ${task.unit}` : ""}`;
  }
}

/**
 * Бонус за скорость: чем быстрее (отн. таймера или 30с) — тем больше прибавка.
 * Возвращает множитель к score: 1.0 .. 1.5
 */
export function speedBonus(ms: number, timeLimitSec?: number): number {
  const limitMs = (timeLimitSec ?? 30) * 1000;
  const ratio = Math.max(0, Math.min(1, 1 - ms / limitMs));
  return 1 + 0.5 * ratio;
}

/**
 * Серверный подсчёт очков за ответ: points × speedBonus, но только за верный
 * ответ. `ms` — СЕРВЕРНОЕ время от начала вопроса (клиентское не доверенное).
 */
export function computeAnswerScore(
  evaluation: { isCorrect: boolean; score: number },
  ms: number,
  timeLimitSec?: number,
): number {
  const elapsed = Math.min(Math.max(0, ms), (timeLimitSec ?? 30) * 1000);
  return Math.round(evaluation.score * (evaluation.isCorrect ? speedBonus(elapsed, timeLimitSec) : 1));
}

export function generateRoomCode(): string {
  // 6 цифр, без 0 в начале. Уникальность проверяется в quiz_rooms (unique index).
  // crypto.getRandomValues, а не Math.random: код — единственная защита комнаты,
  // он не должен угадываться по соседним значениям ГПСЧ. Функция используется
  // и на клиенте, поэтому Web Crypto, а не node:crypto.
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + (buf[0] % 900000));
}

export function generateStudentId(): string {
  // 48 бит случайности: подмена другого ученика требует угадать его id.
  return `s_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

/** API polling: отправить событие в комнату. */
export async function postQuizEvent(
  code: string,
  event: string,
  payload: unknown,
): Promise<void> {
  await fetch(`/api/quiz/${code}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, payload }),
  });
}

export interface QuizEvent {
  seq: number;
  event: string;
  payload: unknown;
  createdAt: string;
}

/** API polling: забрать события комнаты после seq. */
export async function fetchQuizEvents(code: string, since: number): Promise<QuizEvent[]> {
  const res = await fetch(`/api/quiz/${code}?since=${since}`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { events?: QuizEvent[] };
  return data.events ?? [];
}
