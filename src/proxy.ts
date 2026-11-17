import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionTokenSubject } from "@/lib/session-token";

const PROTECTED_PREFIXES = [
  "/admin",
  "/gradebook",
  "/longterm",
  "/import",
  "/kits",
  "/templates",
  "/textbooks",
  "/notifications",
  "/profile",
  "/school",
  "/ai",
] as const;

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();

  // В окружениях с настроенной БД защищённые кабинеты требуют валидный подписанный JWT-токен сессии
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && process.env.MONGODB_URI) {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const subject = await verifySessionTokenSubject(token);
    if (!subject) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", `${pathname}${search}`);
      const redirectRes = NextResponse.redirect(loginUrl);
      redirectRes.headers.set("x-request-id", requestId);
      return redirectRes;
    }
  }

  const response = NextResponse.next();
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/gradebook/:path*",
    "/longterm/:path*",
    "/import/:path*",
    "/kits/:path*",
    "/templates/:path*",
    "/textbooks/:path*",
    "/notifications/:path*",
    "/profile/:path*",
    "/school/:path*",
    "/ai/:path*",
  ],
};
