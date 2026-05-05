import { describe, it, expect } from "vitest";
import { sanitizeForGemini, withRetry } from "./client";

describe("sanitizeForGemini", () => {
  it("strips additionalProperties at the top level", () => {
    const input = {
      type: "object",
      additionalProperties: false,
      properties: { a: { type: "string" } },
    };
    expect(sanitizeForGemini(input)).toEqual({
      type: "object",
      properties: { a: { type: "string" } },
    });
  });

  it("strips additionalProperties recursively", () => {
    const input = {
      type: "object",
      additionalProperties: false,
      properties: {
        nested: {
          type: "object",
          additionalProperties: false,
          properties: { x: { type: "number" } },
        },
        arr: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: { y: { type: "boolean" } },
          },
        },
      },
    };
    const out = sanitizeForGemini(input) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toContain("additionalProperties");
    expect(
      (out.properties as Record<string, Record<string, unknown>>).nested
        .properties,
    ).toEqual({ x: { type: "number" } });
  });

  it("preserves arrays of primitives", () => {
    const input = { enum: ["a", "b", "c"] };
    expect(sanitizeForGemini(input)).toEqual({ enum: ["a", "b", "c"] });
  });
});

describe("withRetry", () => {
  it("succeeds on first attempt without retrying", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls += 1;
      return "ok";
    }, 2);
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries on transient errors (524) and eventually succeeds", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls += 1;
      if (calls < 3) throw new Error("Gemini 524: error");
      return "ok-after-retry";
    }, 3);
    expect(result).toBe("ok-after-retry");
    expect(calls).toBe(3);
  });

  it("retries on AbortError / timeout", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls += 1;
      if (calls === 1) throw new Error("AbortError: signal aborted");
      return "ok";
    }, 1);
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  it("does NOT retry on non-transient errors", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls += 1;
        throw new Error("Gemini 400: bad request");
      }, 5),
    ).rejects.toThrow(/400/);
    expect(calls).toBe(1);
  });

  it("gives up after maxRetries+1 attempts on persistent transient errors", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls += 1;
        throw new Error("Gemini 524: still down");
      }, 2),
    ).rejects.toThrow(/524/);
    expect(calls).toBe(3);
  });
});
