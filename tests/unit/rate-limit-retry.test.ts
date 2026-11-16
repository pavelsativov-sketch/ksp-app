import { describe, expect, it } from "vitest";
import { parseRetryAfterMs, rateLimitRetryMs } from "@/lib/ai/providers";

describe("parseRetryAfterMs", () => {
  it("reads Groq's wait hint in seconds, minutes and milliseconds", () => {
    expect(parseRetryAfterMs("429 Rate limit reached ... Please try again in 42.3s. Need more tokens?")).toBe(42_300);
    expect(parseRetryAfterMs("Please try again in 1m2.5s")).toBe(62_500);
    expect(parseRetryAfterMs("Please try again in 500ms")).toBe(500);
  });

  it("returns null for errors that are not a rate limit", () => {
    expect(parseRetryAfterMs("401 Missing Authentication header")).toBeNull();
    expect(rateLimitRetryMs(new Error("boom"))).toBeNull();
    expect(rateLimitRetryMs(Object.assign(new Error("x"), { retryAfterMs: 1200 }))).toBe(1200);
  });
});
