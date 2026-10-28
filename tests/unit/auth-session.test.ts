import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT, jwtVerify } from "jose";

const mocks = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  getDb: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/mongo", () => ({
  COL: { users: "users" },
  getDb: mocks.getDb,
}));

import { createSession, getCurrentUser, SESSION_COOKIE } from "@/lib/auth";

describe("signed account sessions", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_SECRET", "test-auth-secret-with-at-least-32-characters");
    mocks.cookieValue = undefined;
    mocks.getDb.mockReset();
    mocks.cookies.mockReset().mockResolvedValue({
      get: (name: string) => name === SESSION_COOKIE && mocks.cookieValue ? { value: mocks.cookieValue } : undefined,
      set: (_name: string, value: string) => { mocks.cookieValue = value; },
    });
  });

  it("authenticates signed claims after checking the account session version", async () => {
    // Имя берётся из БД, а не из JWT: после смены профиля сессии не должны
    // показывать устаревшее имя.
    const findOne = vi.fn().mockResolvedValue({ session_version: 3, full_name: "Test Teacher" });
    mocks.getDb.mockResolvedValue({ collection: () => ({ findOne }) });
    await createSession("0123456789abcdef01234567", 3, {
      email: "teacher@example.test",
      fullName: "Test Teacher",
    });

    await expect(getCurrentUser()).resolves.toEqual({
      id: "0123456789abcdef01234567",
      email: "teacher@example.test",
      fullName: "Test Teacher",
    });
    expect(findOne).toHaveBeenCalledOnce();
  });

  it("requires sign-in again for old tokens without signed identity claims", async () => {
    const { AUTH_SECRET } = process.env;
    if (!AUTH_SECRET) throw new Error("test secret missing");
    mocks.cookieValue = await new SignJWT({ sessionVersion: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("0123456789abcdef01234567")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(AUTH_SECRET));

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("includes identity only in a verifiable session token", async () => {
    await createSession("0123456789abcdef01234567", 0, {
      email: "teacher@example.test",
      fullName: null,
    });
    const { payload } = await jwtVerify(
      mocks.cookieValue!,
      new TextEncoder().encode(process.env.AUTH_SECRET),
    );
    expect(payload.email).toBe("teacher@example.test");
    expect(payload.fullName).toBeNull();
  });
});
