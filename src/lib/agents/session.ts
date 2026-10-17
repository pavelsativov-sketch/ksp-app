import { ObjectId } from "mongodb";
import { getDb, COL } from "@/lib/mongo";

function validUserId(userId: string): ObjectId {
  if (!/^[a-f\d]{24}$/i.test(userId)) throw new Error("Некорректный пользователь агента");
  return new ObjectId(userId);
}

/**
 * Кто владеет рабочей областью прямо сейчас (как записано в базе).
 *
 * Прежде здесь отсутствующая строка читалась как «ai». Итог был такой: у
 * учителя без задач в панели горело «AI РАБОТАЕТ» и предлагалось «Забрать
 * управление себе», хотя управлять было некому. Отсутствие записи — это не
 * задача агента, значит по умолчанию управляет учитель.
 */
export async function getControlOwner(userId: string): Promise<"user" | "ai"> {
  const row = await (await getDb()).collection(COL.agentControls).findOne(
    { user_id: validUserId(userId) },
    { projection: { owner: 1 } },
  );
  return row?.owner === "ai" ? "ai" : "user";
}

export async function setControlOwner(userId: string, owner: "user" | "ai"): Promise<void> {
  const now = new Date();
  await (await getDb()).collection(COL.agentControls).updateOne(
    { user_id: validUserId(userId) },
    { $set: { owner, updated_at: now }, $setOnInsert: { created_at: now } },
    { upsert: true },
  );
}

/**
 * Вернуть управление учителю после окончания задачи.
 *
 * Агент водит браузером и песочницей только пока задача жива; после финала
 * (completed/failed/stopped) общая среда остаётся под рукой учителя, и
 * панель перестаёт утверждать, что «AI работает». На паузе у входа в
 * авторизацию управление уже отдано учителю отдельно (runner.ts), поэтому
 * здесь мы его только подтверждаем.
 */
export async function releaseControlToUser(userId: string): Promise<void> {
  if (await getControlOwner(userId) === "ai") await setControlOwner(userId, "user");
}

/** Pause agent work while the account owner controls the shared workspace. */
export async function waitForControl(
  userId: string,
  isStopped: () => Promise<boolean>,
  /** Пока задача стоит на паузе, бьём редко: запись в БД не чаще раза в 10 секунд. */
  heartbeat?: () => Promise<void>,
): Promise<"resumed" | "stopped"> {
  let lastBeat = 0;
  for (;;) {
    if (await isStopped()) return "stopped";
    if (await getControlOwner(userId) === "ai") return "resumed";
    const now = Date.now();
    if (heartbeat && now - lastBeat > 10_000) {
      lastBeat = now;
      await heartbeat().catch(() => {}); // пауза не должна ломаться из-за сбоя записи
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
}
