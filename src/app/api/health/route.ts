import { NextResponse } from "next/server";
import { getDb, isMongoConfigured } from "@/lib/mongo";
import { isAnyProviderConfigured } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/health — статус зависимостей для мониторинга и e2e-тестов. */
export async function GET() {
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

  return NextResponse.json(
    {
      ok: mongo || !mongoConfigured,
      mongo,
      mongoConfigured,
      aiConfigured: isAnyProviderConfigured(),
      dbLatencyMs,
      time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}