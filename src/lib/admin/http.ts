import "server-only";
import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { AdminError } from "./auth";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** JSON-ответ админ-API: не-админ получает 404, чтобы не выдавать существование раздела. */
export async function adminJson(work: () => Promise<unknown>): Promise<NextResponse> {
  try {
    return NextResponse.json({ ok: true, data: await work() }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof AdminError) {
      const hidden = error.status === 401 || error.status === 403;
      return NextResponse.json(
        { ok: false, error: hidden ? "Не найдено." : error.message },
        { status: hidden ? 404 : error.status, headers: { ...NO_STORE, ...(error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {}) } },
      );
    }
    log.error("admin api failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ ok: false, error: "Операция временно недоступна. Попробуйте позже." }, { status: 503, headers: NO_STORE });
  }
}

/** Тело запроса изменения; чужой Origin отклоняется (защита от CSRF поверх SameSite=lax). */
export async function readAdminBody(request: Request): Promise<unknown> {
  const origin = request.headers.get("origin");
  // Сравниваем хост, а не request.url: за прокси он может быть внутренним адресом.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && (!host || URL.parse(origin)?.host !== host)) throw new AdminError(403, "Доступ запрещён.");
  try {
    return await request.json();
  } catch {
    return null;
  }
}
