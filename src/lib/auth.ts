import "server-only";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { cache } from "react";
import { getDb, COL } from "@/lib/mongo";
import { mongoRequestState } from "@/lib/mongo-request-context";

const COOKIE_NAME = "ksp_session";
// Keep sessions short-lived and validate their version against the user record,
// so password changes revoke other sessions immediately.
const SESSION_HOURS = 12;
const DEV_SECRET = "ksp-app-development-secret-only";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string | null;
}

export type SessionIdentity = Pick<SessionUser, "email" | "fullName">;

export interface UserDoc {
  _id: ObjectId;
  email: string;
  password_hash: string;
  full_name: string | null;
  created_at: Date;
  session_version?: number;
  /** Профиль учителя из онбординга (необязательно). */
  school?: string | null;
  subjects_taught?: string[];
  grades_taught?: number[];
  onboarded_at?: Date | null;
}

function secret(): Uint8Array {
  const configured = process.env.AUTH_SECRET;
  if (configured && configured.length >= 32) return new TextEncoder().encode(configured);
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set to a value of at least 32 characters in production");
  }
  if (configured) {
    console.warn("AUTH_SECRET should contain at least 32 characters.");
  } else {
    console.warn("AUTH_SECRET is not set; using a development-only session secret.");
  }
  return new TextEncoder().encode(DEV_SECRET);
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSession(
  userId: string,
  sessionVersion = 0,
  identity?: SessionIdentity,
): Promise<void> {
  const token = await new SignJWT({
    sub: userId,
    sessionVersion,
    ...(identity ? { email: identity.email, fullName: identity.fullName } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 60 * 60,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/**
 * Проверка подписи сессионного токена БЕЗ обращения к базе.
 *
 * Нужна для proxy.ts: там нельзя полагаться на общие модули и глобалы, а
 * полная getCurrentUser() ходит в Mongo. Возвращает id пользователя, если
 * токен подписан верным секретом. Сверка session_version остаётся на
 * страницах и API — здесь мы лишь отсекаем заведомо чужие и просроченные
 * токены, чтобы не отдавать 200 анониму.
 */
export async function readSessionSubject(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { maxTokenAge: "12h" });
    if (!payload.sub || !/^[0-9a-f]{24}$/i.test(payload.sub)) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = COOKIE_NAME;

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  // Кеш в рамках одного запроса: server actions и route handlers могут
  // вызывать getCurrentUser многократно (напр. авторизация + вложенные
  // проверки). React.cache() покрывает рендер, но не отдельные вызовы —
  // поэтому дополнительно кешируем в request-local AsyncLocalStorage.
  const reqState = mongoRequestState();
  const cacheKey = "current-user";
  if (reqState) {
    if (cacheKey in reqState) return (reqState as Record<string, unknown>)[cacheKey] as SessionUser | null;
  }

  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  let result: SessionUser | null = null;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret(), { maxTokenAge: "12h" });
      if (!payload.sub || !/^[0-9a-f]{24}$/i.test(payload.sub)) result = null;
      else {
        // Reject legacy or malformed identities before opening a Mongo connection.
        const email = payload.email;
        const fullName = payload.fullName;
        if (typeof email !== "string" || email.length > 320 || !/^\S+@\S+\.\S+$/.test(email)) result = null;
        else if (fullName !== null && typeof fullName !== "string") result = null;
        else {
          // Ensure the account still exists and the token's version is current.
          const db = await getDb();
          const account = await db.collection<UserDoc>(COL.users).findOne(
            { _id: new ObjectId(payload.sub) },
            { projection: { session_version: 1, full_name: 1 } },
          );
          const tokenVersion = typeof payload.sessionVersion === "number" ? payload.sessionVersion : 0;
          if (!account || (account.session_version ?? 0) !== tokenVersion) {
            // Просроченный/невалидный токен: чистим cookie, чтобы не повторять
            // jwtVerify + запрос к Mongo на каждом вызове.
            try { store.delete(COOKIE_NAME); } catch { /* cookie недоступна */ }
            result = null;
          } else {
            // Имя берём из БД, а не из JWT.
            result = { id: payload.sub, email, fullName: account.full_name ?? null };
          }
        }
      }
    } catch {
      try { store.delete(COOKIE_NAME); } catch { /* cookie недоступна */ }
      result = null;
    }
  }

  if (reqState) (reqState as Record<string, unknown>)[cacheKey] = result;
  return result;
});

export async function findUserByEmail(email: string): Promise<UserDoc | null> {
  const db = await getDb();
  return db.collection<UserDoc>(COL.users).findOne({ email: email.toLowerCase() });
}
