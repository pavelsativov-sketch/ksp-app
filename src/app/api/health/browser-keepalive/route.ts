import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Keepalive endpoint для браузера в Vercel Sandbox.
 * Вызывается из фронтенда при открытой рабочей области ОС — держит песочницу и раннер тёплыми.
 */
export async function GET() {
  const auth = await requireApiAuth();
  if (auth.user) {
    try {
      const { getSandboxBrowserRpcUrl } = await import("@/lib/agents/sandbox-browser-service");
      const rpcUrl = await getSandboxBrowserRpcUrl(auth.user.id);
      return NextResponse.json({ status: "ok", runner: "alive", rpcUrl });
    } catch (e) {
      return NextResponse.json({ status: "warming_up", reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ status: "ok", runner: "sandbox-ready" });
}
