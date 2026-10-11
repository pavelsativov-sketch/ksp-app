import { describe, expect, it } from "vitest";
import { classifyBrowserAcquireError } from "../../src/browser-run-errors.mjs";

describe("Cloudflare Browser Run acquire errors", () => {
  it("identifies the explicit daily browser-time limit", () => {
    expect(classifyBrowserAcquireError(new Error("Browser time limit exceeded for today"))).toMatchObject({
      code: "BROWSER_RUN_QUOTA_EXCEEDED",
      status: 429,
    });
  });

  it("identifies session throttling separately from daily quota", () => {
    expect(classifyBrowserAcquireError(new Error("429 too many browsers: new browser instances are limited"))).toMatchObject({
      code: "BROWSER_RUN_RATE_LIMITED",
      status: 429,
    });
  });

  it("recognizes the daily cap when Cloudflare returns its generic rate-limit text", () => {
    expect(classifyBrowserAcquireError(new Error("429: Rate limit exceeded"), 914)).toMatchObject({
      code: "BROWSER_RUN_QUOTA_EXCEEDED",
      status: 429,
    });
  });

  it("treats unrelated launch failures as temporary service errors", () => {
    expect(classifyBrowserAcquireError(new Error("connection closed"))).toMatchObject({
      code: "BROWSER_RUN_UNAVAILABLE",
      status: 503,
    });
  });
});
