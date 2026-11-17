import { NextResponse } from "next/server";
import type { z } from "zod";
import { requireApiAuth, type ApiUser } from "@/lib/api-auth";
import { isMongoConfigured } from "@/lib/mongo";
import { checkRateLimitAsync, clientIp } from "@/lib/rate-limit";

export interface ApiRateLimitSpec {
  /** Prefix for rate-limit key, e.g. "journal:write" or "sor-soch:gen". */
  prefix: string;
  limit: number;
  windowMs: number;
}

export interface ApiAuthContext<TParams = Record<string, string>> {
  req: Request;
  user: ApiUser;
  params: TParams;
}

export interface WithApiAuthOptions {
  rateLimit?: ApiRateLimitSpec;
  requireMongo?: boolean;
  errorMessage?: string;
}

/**
 * Единая обёртка защищённых API-маршрутов:
 * 1) проверка настройки БД,
 * 2) сессионная авторизация (requireApiAuth),
 * 3) опциональный rate-limit на пользователя/IP,
 * 4) перехват необработанных исключений с безопасным JSON-ответом.
 */
export function withApiAuth<TParams = Record<string, string | string[] | undefined>>(
  options: WithApiAuthOptions,
  handler: (ctx: ApiAuthContext<TParams>) => Promise<NextResponse | Response>,
): (req: Request, routeCtx: { params: Promise<TParams> }) => Promise<Response> {
  return async (
    req: Request,
    routeCtx: { params: Promise<TParams> },
  ): Promise<Response> => {
    if (options.requireMongo !== false && !isMongoConfigured()) {
      return NextResponse.json({ error: "База данных не настроена" }, { status: 503 });
    }

    const auth = await requireApiAuth();
    if (auth.response) return auth.response;

    if (options.rateLimit) {
      const { prefix, limit, windowMs } = options.rateLimit;
      const key = `${prefix}:${auth.user.id || clientIp(req)}`;
      const rl = await checkRateLimitAsync(key, limit, windowMs);
      if (!rl.ok) {
        const retrySec = Math.max(1, Math.ceil(windowMs / 1000));
        return NextResponse.json(
          { error: "Слишком много запросов. Пожалуйста, подождите немного." },
          { status: 429, headers: { "Retry-After": String(retrySec) } },
        );
      }
    }

    const resolvedParams = routeCtx?.params
      ? await Promise.resolve(routeCtx.params)
      : ({} as TParams);

    try {
      return await handler({ req, user: auth.user, params: resolvedParams });
    } catch (error) {
      console.error(`[api:${options.rateLimit?.prefix ?? "handler"}] unhandled error`, error);
      return NextResponse.json(
        { error: options.errorMessage ?? "Внутренняя ошибка сервера" },
        { status: 500 },
      );
    }
  };
}

/** Безопасный разбор и валидация JSON-тела запроса по Zod-схеме. */
export async function parseJsonBody<TSchema extends z.ZodTypeAny>(
  req: Request,
  schema: TSchema,
  invalidMessage = "Некорректные данные запроса",
): Promise<{ data: z.infer<TSchema>; error?: never } | { data?: never; error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: NextResponse.json({ error: "Ожидался корректный JSON" }, { status: 400 }) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues[0]?.message;
    return {
      error: NextResponse.json(
        { error: detail && detail.length < 160 ? detail : invalidMessage },
        { status: 400 },
      ),
    };
  }
  return { data: parsed.data };
}
