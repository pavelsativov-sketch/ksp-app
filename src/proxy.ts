import { NextResponse, type NextRequest } from "next/server";
import { readSessionSubject, SESSION_COOKIE } from "@/lib/auth";

/**
 * Грубая проверка доступа на входе (defence-in-depth).
 *
 * Каждый защищённый роут и API-эндпоинт проверяют доступ сами — это основная
 * линия. Здесь нужен ранний отсев: без него любой новый приватный роут легко
 * остаётся без проверки, и аноним получает 200 вместо редиректа на вход.
 *
 * Намеренно НЕ проверяет владение ресурсом и не ходит в базу: proxy должен
 * оставаться лёгким и не тянуть глобалы. Подпись токена проверяется, а
 * актуальность сессии (session_version) — на странице.
 */

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/profile",
  "/plans/new",
  "/textbooks",
  "/admin",
  "/redeem",
  "/assignments",
  "/quiz/host",
];

/** Роут, который тоже требует входа, но по шаблону с параметром. */
const PROTECTED_PATTERNS: RegExp[] = [
  /^\/plans\/[0-9a-f]{24}\/(edit|history)$/i,
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const needsAuth =
    PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    PROTECTED_PATTERNS.some((re) => re.test(pathname));
  if (!needsAuth) return NextResponse.next();

  const subject = await readSessionSubject(request.cookies.get(SESSION_COOKIE)?.value);
  if (subject) return NextResponse.next();

  // API получает 401, страницы — редирект на вход с возвратом обратно.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/profile/:path*",
    "/plans/new/:path*",
    "/textbooks/:path*",
    "/admin/:path*",
    "/redeem/:path*",
    "/assignments/:path*",
    "/quiz/host/:path*",
    "/plans/:id/edit",
    "/plans/:id/history",
  ],
};
