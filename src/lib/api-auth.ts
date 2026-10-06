import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isMongoConfigured } from "@/lib/mongo";
import { isAnyProviderConfigured } from "@/lib/ai/providers";

export interface ApiUser { id: string; email: string; }
export type AuthResult = { user: ApiUser; response?: never } | { user?: never; response: NextResponse };

export async function requireApiAuth(): Promise<AuthResult> {
  if (isMongoConfigured()) {
    const user = await getCurrentUser();
    if (user) return { user: { id: user.id, email: user.email } };
    return { response: NextResponse.json({ error: "Требуется вход" }, { status: 401 }) };
  }
  // Fail-closed: демо-доступ без входа разрешён только вне продакшена.
  // Иначе через API можно обходить вход, тарифы и квоты.
  if (process.env.NODE_ENV !== "production" && process.env.DEMO_MODE === "true" && !isAnyProviderConfigured()) {
    return { user: { id: "demo", email: "demo@example.com" } };
  }
  return { response: NextResponse.json({ error: "Требуется настроенная аутентификация" }, { status: 401 }) };
}
