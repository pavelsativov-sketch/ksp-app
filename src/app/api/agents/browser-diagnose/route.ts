import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { browserFailure, getAgentBrowserSession } from "@/lib/agents/browser-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Диагностика загрузки страницы в облачном браузере ОС: что висит, что упало,
 * как долго отвечают хосты и с какого адреса песочница выходит в сеть.
 * Читает только открытую страницу своей сессии; пароли и куки не отдаёт.
 */
const probe = async () => {
  const short = (value: string) => value.replace(/^https?:\/\//, "").slice(0, 110);
  const timed = async (url: string, init: RequestInit = {}) => {
    const started = performance.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      return { url: short(url), ms: Math.round(performance.now() - started), status: response.status, type: response.type };
    } catch (error) {
      return { url: short(url), ms: Math.round(performance.now() - started), error: String(error).slice(0, 80) };
    }
  };

  const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  const hosts = Array.from(new Set(resources.map((r) => new URL(r.name).hostname))).slice(0, 12);
  const failed = resources
    .filter((r) => (r as unknown as { responseStatus?: number }).responseStatus === 0 || ((r as unknown as { responseStatus?: number }).responseStatus ?? 200) >= 400)
    .slice(0, 15)
    .map((r) => ({ name: short(r.name), status: (r as unknown as { responseStatus?: number }).responseStatus, ms: Math.round(r.duration) }));
  const slowest = [...resources]
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 8)
    .map((r) => ({ name: short(r.name), ms: Math.round(r.duration), kb: Math.round((r.transferSize || 0) / 1024) }));

  const probes = await Promise.all([
    timed("https://api.ipify.org?format=json"),
    timed(location.origin + "/", { mode: "no-cors" }),
    ...hosts.filter((h) => h !== location.hostname).slice(0, 5).map((h) => timed("https://" + h + "/", { mode: "no-cors" })),
  ]);

  return {
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    bodyText: (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 300),
    bodyChildren: document.body?.children.length ?? 0,
    scripts: Array.from(document.scripts).map((s) => short(s.src || "(inline)")).slice(0, 12),
    webdriver: navigator.webdriver,
    language: navigator.language,
    userAgent: navigator.userAgent.slice(0, 120),
    navigation: nav
      ? { domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd), loadMs: Math.round(nav.loadEventEnd), responseStatus: (nav as unknown as { responseStatus?: number }).responseStatus }
      : null,
    resourceCount: resources.length,
    hosts,
    failed,
    slowest,
    probes,
  };
};

export async function GET(req: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const rl = await checkRateLimitAsync(`agent:browser-diagnose:${auth.user.id}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });

  const reload = new URL(req.url).searchParams.get("reload") === "1";
  try {
    const session = await getAgentBrowserSession(auth.user.id);
    if (reload) {
      await session.page.reload({ timeout: 30_000 }).catch(() => undefined);
      await session.page.waitForTimeout(5000);
    }
    const report = await session.page.evaluate(probe as never);
    return NextResponse.json({ ok: true, report });
  } catch (error) {
    const failure = browserFailure(error);
    // Своя сессия владельца: подробность ошибки раннера нужна, чтобы понять причину.
    return NextResponse.json({ error: failure.message, detail: error instanceof Error ? error.message.slice(0, 400) : String(error).slice(0, 400) }, { status: failure.status });
  }
}
