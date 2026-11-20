import { jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "ksp_session";
const DEV_SECRET = "ksp-app-development-secret-only";

export function getSessionSecretBytes(): Uint8Array {
  const configured = process.env.AUTH_SECRET;
  if (configured && configured.length >= 32) {
    return new TextEncoder().encode(configured);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set to a value of at least 32 characters in production");
  }
  return new TextEncoder().encode(DEV_SECRET);
}

/**
 * Быстрая криптографическая проверка подписи и срока сессионного JWT без обращения к MongoDB.
 * Используется в Next.js 16 src/proxy.ts для отсечения анонимных запросов к закрытым разделам.
 */
export async function verifySessionTokenSubject(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSessionSecretBytes(), {
      algorithms: ["HS256"],
      maxTokenAge: "12h",
    });
    if (!payload.sub || !/^[0-9a-f]{24}$/i.test(payload.sub)) return null;
    return payload.sub;
  } catch {
    return null;
  }
}
