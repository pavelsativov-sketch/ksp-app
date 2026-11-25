import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getDb, isMongoConfigured } from "@/lib/mongo";
import { isAnyProviderConfigured } from "@/lib/ai/providers";
import { getRateLimitFallbackStats } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/auth";
import { isAdminUserId } from "@/lib/admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Заголовок с секретом мониторинга (env HEALTH_TOKEN) для подробного ответа. */
const HEALTH_TOKEN_HEADER = "x-health-token";

function hasMonitoringToken(request: Request): boolean {
  const expected = process.env.HEALTH_TOKEN?.trim();
  const given = request.headers.get(HEALTH_TOKEN_HEADER)?.trim();
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function canSeeDetails(request: Request): Promise<boolean> {
  if (hasMonitoringToken(request)) return true;
  try {
    const user = await getCurrentUser();
    return !!user && isAdminUserId(user.id);
  } catch {
    return false;
  }
}

/**
 * GET /api/health — публично только {ok}; состав зависимостей и задержки
 * видны админу или мониторингу с заголовком x-health-token.
 */
export async function GET(request: Request) {
  const mongoConfigured = isMongoConfigured();
  let mongo = false;
  let dbLatencyMs: number | null = null;

  if (mongoConfigured) {
    const t0 = Date.now();
    try {
      const db = await getDb();
      await db.command({ ping: 1 });
      mongo = true;
      dbLatencyMs = Date.now() - t0;
    } catch {
      mongo = false;
    }
  }

  const ok = mongo || !mongoConfigured;
  const headers = { "Cache-Control": "no-store" };
  if (!(await canSeeDetails(request))) return NextResponse.json({ ok }, { headers });

  return NextResponse.json(
    {
      ok,
      mongo,
      mongoConfigured,
      aiConfigured: isAnyProviderConfigured(),
      rateLimitFallback: getRateLimitFallbackStats(),
      dbLatencyMs,
      time: new Date().toISOString(),
    },
    { headers },
  );
}
