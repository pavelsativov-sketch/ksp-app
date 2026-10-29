import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Автопродолжение длинных задач агента.
 *
 * Один запрос Vercel живёт до ~5 минут, а настоящая работа агента (как у Devin)
 * может идти дольше. Когда время сессии кончается, а задача не закончена,
 * раннер сохраняет контрольную точку и запускает себя заново отдельным
 * запросом. Запрос подписан HMAC от AUTH_SECRET, чтобы никто снаружи не мог
 * запускать чужие задачи.
 */
export const MAX_CONTINUATIONS = 6;

export type ContinuationDecision = "continue" | "finish";

/** Решает, продолжать ли задачу в новой сессии или честно завершить с ошибкой. */
export function decideContinuation(input: {
  reason: "steps" | "time" | undefined;
  continuations: number;
  appUrl: string | null;
}): ContinuationDecision {
  // Лимит шагов — осознанная граница задачи: продолжать нечем и незачем.
  if (input.reason !== "time") return "finish";
  if (!input.appUrl) return "finish";
  return input.continuations < MAX_CONTINUATIONS ? "continue" : "finish";
}

/** Адрес приложения для самовызова: явный APP_URL, иначе адрес Vercel. */
export function appBaseUrl(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env.APP_URL?.trim()
    || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "")
    || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : "");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function secretFor(taskId: string, authSecret: string): Buffer {
  return createHmac("sha256", authSecret).update(`agent-continue:${taskId}`).digest();
}

export function signContinuation(taskId: string, authSecret = process.env.AUTH_SECRET ?? ""): string {
  if (authSecret.length < 32) throw new Error("AUTH_SECRET слишком короткий для подписи продолжения");
  return secretFor(taskId, authSecret).toString("base64url");
}

export function verifyContinuation(taskId: string, signature: string | null, authSecret = process.env.AUTH_SECRET ?? ""): boolean {
  if (!signature || authSecret.length < 32) return false;
  const expected = secretFor(taskId, authSecret);
  let given: Buffer;
  try {
    given = Buffer.from(signature, "base64url");
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Запрос на продолжение. true — приложение приняло задачу. */
export async function triggerContinuation(taskId: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const base = appBaseUrl();
  if (!base) return false;
  try {
    const response = await fetchImpl(`${base}/api/agents/task/continue`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-mekty-continue": signContinuation(taskId) },
      body: JSON.stringify({ taskId }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
