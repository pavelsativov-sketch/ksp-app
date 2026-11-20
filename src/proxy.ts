import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionTokenSubject } from "@/lib/session-token";

const PROTECTED_PREFIXES = [
  "/admin",
  "/dashboard",
  "/favorites",
  "/assignments",
  "/quiz/host",
  "/redeem",
  "/feedback",
  "/plans/new",
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

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function allowedOrigins(request: NextRequest): Set<string> {
  const allowed = new Set<string>([request.nextUrl.origin]);
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) {
    try {
      allowed.add(new URL(appUrl).origin);
    } catch {
      /* ignore malformed APP_URL */
    }
  }
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  if (forwardedHost) {
    allowed.add(`${forwardedProto}://${forwardedHost}`);
  }
  const host = request.headers.get("host")?.trim();
  if (host) {
    allowed.add(`${request.nextUrl.protocol}//${host}`);
  }
  return allowed;
}

/**
 * Defense-in-depth CSRF защита для всех изменяющих API-запросов:
 * если браузер передал заголовок Origin или Sec-Fetch-Site: cross-site,
 * источник обязан совпадать с нашим доменом.
 */
function isCrossSiteMutation(request: NextRequest): boolean {
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) return false;
  const origin = request.headers.get("origin");
  if (origin) {
    return !allowedOrigins(request).has(origin);
  }
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") return true;
  return false;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const isApi = pathname === "/api" || pathname.startsWith("/api/");

  if (isApi) {
    if (isCrossSiteMutation(request)) {
      const blocked = NextResponse.json(
        { error: "Запрос с внешнего источника отклонён" },
        { status: 403 },
      );
      blocked.headers.set("x-request-id", requestId);
      blocked.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      return blocked;
    }
    const response = NextResponse.next();
    response.headers.set("x-request-id", requestId);
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return response;
  }

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
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

export const config = {
  matcher: [
    "/api/:path*",
    "/admin/:path*",
    "/dashboard/:path*",
    "/favorites/:path*",
    "/assignments/:path*",
    "/quiz/host/:path*",
    "/redeem/:path*",
    "/feedback/:path*",
    "/plans/new",
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
