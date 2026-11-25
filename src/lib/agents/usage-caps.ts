import { NextResponse } from "next/server";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getPlanForUser } from "@/lib/billing/quota";

const DAY_MS = 24 * 60 * 60_000;
const HOUR_MS = 60 * 60_000;

/** Новых задач агента (включая «Использование компьютера») в сутки на пользователя. */
export const AGENT_TASKS_PER_DAY = 50;
/** Команд терминала Linux-среды в сутки по тарифу. */
export const TERMINAL_COMMANDS_PER_DAY = { free: 200, pro: 2000 } as const;
/** Новых Linux-сред в час с одного IP: защита от фермы бесплатных аккаунтов. */
export const SANDBOX_CREATES_PER_HOUR_PER_IP = 10;

const tooMany = (error: string) => NextResponse.json({ error }, { status: 429 });

export async function checkAgentDailyCap(userId: string): Promise<NextResponse | null> {
  const rl = await checkRateLimitAsync(`agent:new:day:${userId}`, AGENT_TASKS_PER_DAY, DAY_MS);
  return rl.ok
    ? null
    : tooMany(`Дневной лимит запусков агента (${AGENT_TASKS_PER_DAY}) исчерпан. Попробуйте завтра.`);
}

export async function checkTerminalDailyCap(userId: string): Promise<NextResponse | null> {
  let plan: "free" | "pro" = "free";
  try {
    plan = (await getPlanForUser(userId)).plan;
  } catch {
    // Тариф не прочитался — считаем по бесплатному (строже, а не слабее).
  }
  const limit = TERMINAL_COMMANDS_PER_DAY[plan];
  const rl = await checkRateLimitAsync(`agent:terminal:day:${userId}`, limit, DAY_MS);
  if (rl.ok) return null;
  return tooMany(
    plan === "free"
      ? `Дневной лимит команд терминала на бесплатном тарифе (${limit}) исчерпан. Подключите Pro или попробуйте завтра.`
      : `Дневной лимит команд терминала (${limit}) исчерпан. Попробуйте завтра.`,
  );
}

export class SandboxCreateLimitError extends Error {
  readonly status = 429;
}

/** Хук перед созданием новой Linux-среды: не больше N новых сред в час с одного IP. */
export function sandboxCreateGuard(ip: string): () => Promise<void> {
  return async () => {
    const rl = await checkRateLimitAsync(`agent:sandbox:create:ip:${ip}`, SANDBOX_CREATES_PER_HOUR_PER_IP, HOUR_MS);
    if (!rl.ok) {
      throw new SandboxCreateLimitError("Слишком много новых Linux-сред с вашего адреса. Попробуйте через час.");
    }
  };
}
