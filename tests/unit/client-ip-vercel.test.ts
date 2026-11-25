import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIpFromHeaders } from "@/lib/rate-limit";

afterEach(() => vi.unstubAllEnvs());

describe("clientIpFromHeaders", () => {
  it("uses Vercel's x-real-ip on Vercel, so visitors no longer share one 'unknown' rate-limit bucket", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("TRUSTED_IP_HEADER", "");
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("ignores x-real-ip outside Vercel, where a client could spoof it", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("TRUSTED_IP_HEADER", "");
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": "203.0.113.7" }))).toBe("unknown");
  });

  it("still prefers Cloudflare's header and an explicit trusted header", () => {
    vi.stubEnv("VERCEL", "1");
    expect(clientIpFromHeaders(new Headers({ "cf-connecting-ip": "198.51.100.1", "x-real-ip": "203.0.113.7" }))).toBe("198.51.100.1");
    vi.stubEnv("TRUSTED_IP_HEADER", "x-client-ip");
    expect(clientIpFromHeaders(new Headers({ "x-client-ip": "192.0.2.5, 10.0.0.1", "x-real-ip": "203.0.113.7" }))).toBe("192.0.2.5");
  });
});
