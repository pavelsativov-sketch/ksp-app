import "server-only";

/**
 * Permission Manager (§21 спецификации): у каждого действия агента — уровень
 * риска. HIGH требует явного Allow/Deny от пользователя, MEDIUM — выполняется,
 * но помечается, LOW — автоматически. «Always allow» отключает запросы
 * до перезапуска сервера (MVP-политика).
 */

export type Risk = "low" | "medium" | "high";

interface PendingRequest {
  id: string;
  command: string;
  risk: Risk;
  resolve: (allow: boolean) => void;
  createdAt: number;
}

const pending = new Map<string, PendingRequest>();
const alwaysAllow = new Set<string>();

const LOW = [/^(dir|ls|pwd|cat|type|head|tail|echo|whoami|date|node --version|git (status|log|diff))/i];
const HIGH = [/(rm|del|rd|remove-item)\s/i, /(curl|wget|invoke-webrequest|iwr)\s/i, /git push/i, /(format|shutdown|reg |diskpart)/i, /npm (publish|uninstall)/i];

export function classifyCommand(cmd: string): Risk {
  if (HIGH.some((r) => r.test(cmd))) return "high";
  if (LOW.some((r) => r.test(cmd.trim()))) return "low";
  return "medium";
}

export function alwaysAllows(userId: string): boolean {
  return alwaysAllow.has(userId);
}

export function setAlwaysAllow(userId: string): void {
  alwaysAllow.add(userId);
}

/** Запросить разрешение: резолвится решением пользователя или таймаутом (deny). */
export function requestPermission(userId: string, command: string, risk: Risk): Promise<boolean> {
  if (risk !== "high" || alwaysAllow.has(userId)) return Promise.resolve(true);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(false); // молчание = запрет (fail-closed)
    }, 180_000);
    pending.set(userId === "" ? id : `${userId}:${id}`, {
      id,
      command,
      risk,
      createdAt: Date.now(),
      resolve: (allow) => {
        clearTimeout(timer);
        resolve(allow);
      },
    });
  });
}

export function listPending(userId: string): { id: string; command: string; risk: Risk; createdAt: number }[] {
  return [...pending.entries()]
    .filter(([key]) => key.startsWith(`${userId}:`))
    .map(([, r]) => ({ id: r.id, command: r.command, risk: r.risk, createdAt: r.createdAt }));
}

export function resolvePermission(userId: string, id: string, allow: boolean, always: boolean): boolean {
  const key = `${userId}:${id}`;
  const r = pending.get(key);
  if (!r) return false;
  pending.delete(key);
  if (always && allow) alwaysAllow.add(userId);
  r.resolve(allow);
  return true;
}
