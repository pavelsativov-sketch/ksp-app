import "server-only";
import { ObjectId } from "mongodb";
import { getDb, COL } from "@/lib/mongo";
import type { ProposedAction } from "./loop";
import type { SafetyDecision } from "./safety";
import type { ElementProbe } from "./screen";

/**
 * Подтверждения опасных действий агента «Работа с компьютером».
 *
 * Хранятся в Mongo, а не в памяти процесса: на Vercel агент, ответ учителя и
 * опрос списка могут обслуживать разные инстансы функции, и с массивом в памяти
 * кнопки «Разрешить» и «Остановить» не доходили бы до работающего агента.
 * Отсутствие ответа за TIMEOUT_MS — отказ.
 */
export interface ConfirmationRequest {
  id: string;
  action: ProposedAction;
  decision: SafetyDecision;
  probe: ElementProbe;
}

export const CONFIRM_TIMEOUT_MS = 120_000;
const POLL_MS = 700;

type ConfirmDoc = {
  _id: ObjectId;
  user_id: string;
  action: ProposedAction;
  decision: SafetyDecision;
  probe: ElementProbe;
  status: "pending" | "allowed" | "denied" | "expired";
  created_at: Date;
  expires_at: Date;
};

async function confirms() {
  return (await getDb()).collection<ConfirmDoc>(COL.agentComputerConfirms);
}

function validId(id: string): ObjectId | null {
  return /^[a-f\d]{24}$/i.test(id) ? new ObjectId(id) : null;
}

export async function listPending(userId: string): Promise<ConfirmationRequest[]> {
  const rows = await (await confirms())
    .find({ user_id: userId, status: "pending", expires_at: { $gt: new Date() } })
    .sort({ created_at: 1 })
    .limit(20)
    .toArray();
  return rows.map((row) => ({ id: row._id.toString(), action: row.action, decision: row.decision, probe: row.probe }));
}

/** Один раз и только владельцу: чужой или уже решённый запрос не принимается. */
export async function resolveConfirmation(userId: string, id: string, allowed: boolean): Promise<boolean> {
  const oid = validId(id);
  if (!oid) return false;
  const result = await (await confirms()).updateOne(
    { _id: oid, user_id: userId, status: "pending", expires_at: { $gt: new Date() } },
    { $set: { status: allowed ? "allowed" : "denied" } },
  );
  return result.modifiedCount === 1;
}

/** Отклоняет все ожидающие запросы пользователя (кнопка «Остановить»). */
export async function cancelAll(userId: string): Promise<void> {
  await (await confirms()).updateMany({ user_id: userId, status: "pending" }, { $set: { status: "denied" } });
}

export async function countPending(userId: string): Promise<number> {
  return (await confirms()).countDocuments({ user_id: userId, status: "pending", expires_at: { $gt: new Date() } });
}

export async function waitForConfirmation(
  userId: string,
  action: ProposedAction,
  decision: SafetyDecision,
  probe: ElementProbe,
  opts: { timeoutMs?: number; pollMs?: number } = {},
): Promise<boolean> {
  const timeoutMs = opts.timeoutMs ?? CONFIRM_TIMEOUT_MS;
  const pollMs = opts.pollMs ?? POLL_MS;
  const collection = await confirms();
  const id = new ObjectId();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + timeoutMs);
  await collection.insertOne({ _id: id, user_id: userId, action, decision, probe, status: "pending", created_at: createdAt, expires_at: expiresAt });

  while (Date.now() < expiresAt.getTime()) {
    const row = await collection.findOne({ _id: id }, { projection: { status: 1 } });
    if (!row || row.status === "denied" || row.status === "expired") return false;
    if (row.status === "allowed") return true;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  await collection.updateOne({ _id: id, status: "pending" }, { $set: { status: "expired" } });
  return false;
}
