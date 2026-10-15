import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { Sandbox } = await import("@vercel/sandbox");
    const testSb = await Sandbox.getOrCreate({
      name: "test-port-route",
      image: "vercel/sandbox/universal",
      ports: [3000],
      timeout: 60_000,
    });
    const routes = (testSb as unknown as { routes?: unknown[] }).routes;
    let domain: string | null = null;
    try {
      domain = testSb.domain(3000);
    } catch (e) {
      domain = `error: ${e instanceof Error ? e.message : String(e)}`;
    }
    await testSb.delete({ deleteOrphanSnapshots: true }).catch(() => {});
    return NextResponse.json({ ok: true, routes, domain });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}
