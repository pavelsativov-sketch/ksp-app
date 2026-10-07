import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isMongoConfigured } from "@/lib/mongo";

export interface ApiUser { id: string; email: string; }
export type AuthResult = { user: ApiUser; response?: never } | { user?: never; response: NextResponse };

export async function requireApiAuth(): Promise<AuthResult> {
  if (isMongoConfigured()) {
    const user = await getCurrentUser();
    if (user) return { user: { id: user.id, email: user.email } };
    return { response: NextResponse.json({ error: "Требуется вход" }, { status: 401 }) };
  }
  return { response: NextResponse.json({ error: "Требуется настроенная аутентификация" }, { status: 401 }) };
}
