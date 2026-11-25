/**
 * M3: регистрация и вход не раскрывают, есть ли аккаунт с таким email.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MongoServerError } from "mongodb";

const mock = vi.hoisted(() => ({
  insertOne: vi.fn(),
  createSession: vi.fn(),
  findUserByEmail: vi.fn(),
  verifyPassword: vi.fn(async (_plain: string, _hash: string) => false),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/mailer", () => ({
  isEmailConfigured: () => false, notifyAdmins: vi.fn(), renderMektyEmail: vi.fn(), sendEmail: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: async () => ({ ok: true, remaining: 1, resetAt: 0 }),
  clientIpFromHeaders: () => "203.0.113.9",
}));
vi.mock("@/lib/mongo", () => ({
  COL: { users: "users" },
  getDb: async () => ({ collection: () => ({ insertOne: mock.insertOne }) }),
}));
vi.mock("@/lib/auth", () => ({
  createSession: mock.createSession,
  clearSession: vi.fn(),
  findUserByEmail: mock.findUserByEmail,
  hashPassword: async () => "hash",
  invalidateUserSessionCache: vi.fn(),
  verifyPassword: mock.verifyPassword,
}));

import { loginAction, registerAction } from "@/app/actions/auth";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};

beforeEach(() => vi.clearAllMocks());

describe("registerAction: занятый email", () => {
  it("отвечает нейтрально и не создаёт сессию", async () => {
    mock.insertOne.mockRejectedValue(new MongoServerError({ message: "dup", code: 11000 }));
    const state = await registerAction({}, form({ email: "taken@example.invalid", password: "x".repeat(12), fullName: "Аня" }));
    expect(state.error).toBeUndefined();
    expect(state.info).toMatch(/Если такой email свободен/);
    expect(mock.createSession).not.toHaveBeenCalled();
  });
});

describe("loginAction: неизвестный email", () => {
  it("всё равно выполняет сравнение bcrypt и отвечает тем же текстом", async () => {
    mock.findUserByEmail.mockResolvedValue(null);
    const state = await loginAction({}, form({ email: "nobody@example.invalid", password: "x".repeat(12) }));
    expect(state.error).toBe("Неверный email или пароль");
    expect(mock.verifyPassword).toHaveBeenCalledOnce();
    expect(mock.verifyPassword.mock.calls[0]?.[1]).toMatch(/^\$2[aby]\$12\$/);
  });
});
