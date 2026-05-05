/**
 * GET /api/health — lightweight health probe.
 *
 *   {
 *     ok: true,
 *     supabase: { configured, reachable },
 *     ai:       { provider, configured },
 *     buildId,
 *     time
 *   }
 *
 * Used by uptime checks and on-call debugging. Cheap: one parallel HEAD
 * to Supabase REST and a single env read for the AI provider.
 */

import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getActiveProvider, isAiConfigured } from "@/lib/ai/client";

export const runtime = "nodejs";

async function pingSupabase(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
      signal: AbortSignal.timeout(3000),
    });
    // Any HTTP response from the Supabase gateway means the project is up.
    // We don't care about the status code (e.g. 401 means we're missing a
    // header, 200 means OK, 404 means the path moved) — the gateway answered.
    return res.status > 0;
  } catch {
    return false;
  }
}

export async function GET() {
  const supabaseReachable = await pingSupabase();
  const ok = isSupabaseConfigured() ? supabaseReachable : true;
  return NextResponse.json(
    {
      ok,
      supabase: {
        configured: isSupabaseConfigured(),
        reachable: supabaseReachable,
      },
      ai: {
        provider: getActiveProvider(),
        configured: isAiConfigured(),
      },
      buildId: process.env.NEXT_BUILD_ID ?? null,
      time: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}
