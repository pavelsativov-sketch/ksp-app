import { describe, expect, it } from "vitest";
import {
  generateSessionCode,
  isValidSessionCode,
} from "@/lib/ksp/session-code";

describe("session code", () => {
  it("generates a 6-character code from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateSessionCode();
      expect(code).toHaveLength(6);
      // Only A-Z minus I/O/L/U + digits 2-9.
      expect(/^[ABCDEFGHJKMNPQRSTVWXYZ23456789]{6}$/.test(code)).toBe(true);
      expect(code).not.toMatch(/[01ILOU]/);
    }
  });

  it("isValidSessionCode accepts generated codes and rejects garbage", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(isValidSessionCode(generateSessionCode())).toBe(true);
    }
    expect(isValidSessionCode("abcde2")).toBe(true); // gets uppercased
    expect(isValidSessionCode("ABC123")).toBe(false); // 1 is excluded
    expect(isValidSessionCode("AB1234")).toBe(false); // 1 is excluded
    expect(isValidSessionCode("ABC23")).toBe(false); // too short
    expect(isValidSessionCode("ABCDE23")).toBe(false); // too long
    expect(isValidSessionCode("ABCDE!")).toBe(false); // invalid chars
  });

  it("does not collide trivially in 1000 draws (sanity check)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      seen.add(generateSessionCode());
    }
    // 30^6 ≈ 729M, 1000 draws should give ~0 collisions.
    expect(seen.size).toBeGreaterThan(995);
  });
});
