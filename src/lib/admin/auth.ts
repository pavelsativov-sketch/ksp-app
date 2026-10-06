import "server-only";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimitAsync, isDistributedLimiterActive } from "@/lib/rate-limit";

export class AdminError extends Error {
  constructor(public status: 401 | 403 | 400 | 404 | 409 | 429 | 503, message: string, public retryAfter?: number) {
    super(message);
  }
}

/** Fail closed: never infer privileges from email, user fields, or request input. */
export function isAdminUserId(id: string): boolean {
  if (!/^[a-f\d]{24}$/i.test(id)) return false;
  const entries = (process.env.ADMIN_USER_IDS ?? "").split(",").map((value) => value.trim());
  if (!entries.length || entries.some((value) => !/^[a-f\d]{24}$/i.test(value))) return false;
  return entries.some((value) => value.toLowerCase() === id.toLowerCase());
}

export async function requireAdmin() {
  // getCurrentUser verifies the signed session AND the existing Mongo user/session version.
  const user = await getCurrentUser();
  if (!user) throw new AdminError(401, "Требуется вход.");
  if (!isAdminUserId(user.id)) throw new AdminError(403, "Доступ запрещён.");
  return user;
}

export async function limitAdmin(id: string, operation: "read" | "create" | "revoke") {
  if (!await isDistributedLimiterActive()) throw new AdminError(503, "Администрирование временно недоступно.");
  const limit = operation === "read" ? 60 : operation === "create" ? 20 : 60;
  const window = operation === "read" ? 60_000 : 3600_000;
  const rate = await checkRateLimitAsync(`admin:${operation}:${id}`, limit, window);
  if (!rate.ok) throw new AdminError(429, "Слишком много запросов. Попробуйте позже.", Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000)));
}
