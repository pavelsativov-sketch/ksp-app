import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import nextConfig from "../../next.config";
import { listTrashedPlans } from "@/lib/plan-trash";

describe("Security hardening", () => {
  it("blocks cross-origin mutating API requests (CSRF defense-in-depth)", async () => {
    const req = new NextRequest("https://ksp-app-pi.vercel.app/api/plans/123/like", {
      method: "POST",
      headers: {
        origin: "https://evil.attacker.example",
        host: "ksp-app-pi.vercel.app",
      },
    });
    const res = await proxy(req);
    expect(res.status).toBe(403);
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("blocks Sec-Fetch-Site: cross-site API mutations even without Origin", async () => {
    const req = new NextRequest("https://ksp-app-pi.vercel.app/api/billing/redeem", {
      method: "POST",
      headers: { "sec-fetch-site": "cross-site" },
    });
    const res = await proxy(req);
    expect(res.status).toBe(403);
  });

  it("allows same-origin mutating API requests and tags API responses noindex", async () => {
    const req = new NextRequest("https://ksp-app-pi.vercel.app/api/feedback", {
      method: "POST",
      headers: {
        origin: "https://ksp-app-pi.vercel.app",
        host: "ksp-app-pi.vercel.app",
        "sec-fetch-site": "same-origin",
      },
    });
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("redirects unauthenticated access to private cabinets when MONGODB_URI is set", async () => {
    const prev = process.env.MONGODB_URI;
    process.env.MONGODB_URI = "mongodb://localhost:27017/test";
    try {
      for (const path of ["/admin", "/dashboard", "/quiz/host/123", "/assignments/abc"]) {
        const req = new NextRequest(`https://ksp-app-pi.vercel.app${path}`);
        const res = await proxy(req);
        expect(res.status).toBe(307);
        expect(res.headers.get("location")).toContain(`/login?next=${encodeURIComponent(path)}`);
      }
    } finally {
      if (prev === undefined) delete process.env.MONGODB_URI;
      else process.env.MONGODB_URI = prev;
    }
  });

  it("hardens HTTP security headers and removes third-party CDN script CSP bypasses", async () => {
    expect(nextConfig.poweredByHeader).toBe(false);
    const rules = await nextConfig.headers!();
    const hdrs = Object.fromEntries(rules[0]!.headers.map((h) => [h.key.toLowerCase(), h.value]));
    expect(hdrs["x-content-type-options"]).toBe("nosniff");
    expect(hdrs["cross-origin-opener-policy"]).toBe("same-origin");
    expect(hdrs["cross-origin-resource-policy"]).toBe("same-origin");
    expect(hdrs["x-permitted-cross-domain-policies"]).toBe("none");
    expect(hdrs["content-security-policy"]).not.toContain("cdn.jsdelivr.net");
    expect(hdrs["content-security-policy"]).not.toContain("unpkg.com");
    expect(hdrs["content-security-policy"]).toContain("object-src 'none'");
  });

  it("rejects malformed userId in listTrashedPlans before touching DB", async () => {
    const result = await listTrashedPlans("not-an-object-id");
    expect(result).toEqual([]);
  });
});
