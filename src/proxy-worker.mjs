// The application has one public origin on Vercel. This Worker stays deployed
// only as the signed Cloudflare Browser Run bridge used by the Vercel backend.
export { AgentTaskWorkflow } from "./lib/agents/workflow.ts";
import { handleBrowserRpc } from "./browser-rpc-worker.mjs";

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === "/_agent/browser") {
      return handleBrowserRpc(request, env);
    }

    let origin;
    try {
      origin = new URL(env.VERCEL_ORIGIN);
    } catch {
      return new Response("Vercel origin is not configured", { status: 500 });
    }

    if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
      return new Response("Vercel origin must be an HTTPS origin", { status: 500 });
    }

    const incoming = new URL(request.url);
    const target = new URL(origin.origin);
    target.pathname = incoming.pathname;
    target.search = incoming.search;
    return new Response(null, {
      status: 307,
      headers: {
        Location: target.toString(),
        "Cache-Control": "no-store",
      },
    });
  },
};
