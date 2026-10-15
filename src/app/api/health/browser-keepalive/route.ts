import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Keepalive endpoint для Codespaces runner.
 * Вызывается Vercel Cron каждые 14 минут — не даёт runner заснуть.
 * Если runner недоступен — возвращает статус, не бросает ошибку (cron не должен падать).
 */
export async function GET() {
  const runnerUrl = process.env.BROWSER_RPC_URL;
  if (!runnerUrl) {
    return NextResponse.json({ status: "skipped", reason: "BROWSER_RPC_URL not configured" });
  }

  // Строим URL health-check из RPC URL
  // BROWSER_RPC_URL = https://...host.../_agent/browser → health = https://...host.../health
  let healthUrl: string;
  try {
    const base = new URL(runnerUrl);
    base.pathname = "/health";
    healthUrl = base.toString();
  } catch {
    return NextResponse.json({ status: "error", reason: "Invalid BROWSER_RPC_URL" }, { status: 500 });
  }

  const t0 = Date.now();
  try {
    const res = await fetch(healthUrl, {
      method: "GET",
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    const elapsed = Date.now() - t0;

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({
        status: "ok",
        runner: "alive",
        elapsed,
        sessions: (data as Record<string, unknown>).sessions ?? 0,
        uptime: (data as Record<string, unknown>).uptime,
      });
    }

    return NextResponse.json({
      status: "warn",
      runner: "unhealthy",
      httpStatus: res.status,
      elapsed,
    });
  } catch (e) {
    const elapsed = Date.now() - t0;
    const msg = e instanceof Error ? e.message : String(e);
    // Runner sleeping — это нормально, просто логируем
    return NextResponse.json({
      status: "sleeping",
      runner: "unreachable",
      reason: msg,
      elapsed,
    });
  }
}
