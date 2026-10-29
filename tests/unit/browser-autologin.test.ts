/**
 * Автовход: учитель один раз вводит логин и пароль в окне, дальше система сама
 * заполняет форму. Пароль уходит только в страницу — не в ответ инструмента.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ docs: [] as Array<Record<string, unknown>> }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/mongo", () => ({
  COL: { browserCredentials: "browser_credentials" },
  getDb: async () => ({
    collection: () => ({
      updateOne: async (filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) => {
        const found = store.docs.find((d) => d.user_id === filter.user_id && d.domain === filter.domain);
        if (found) Object.assign(found, update.$set);
        else store.docs.push({ ...filter, ...update.$set });
      },
      findOne: async (filter: Record<string, unknown>) =>
        store.docs.find((d) => d.user_id === filter.user_id && d.domain === filter.domain) ?? null,
    }),
  }),
}));

import { knownLoginSite, loginWithSavedCredentials, saveCredentials } from "@/lib/agents/browser-autologin";

process.env.AUTH_SECRET = "x".repeat(40);

function fakePage(opts: { url?: string; passwordStaysAfterLogin?: boolean; noForm?: boolean } = {}) {
  const typed: string[] = [];
  const pressed: string[] = [];
  let submitted = false;
  const page = {
    url: () => opts.url ?? "https://www.bilimclass.kz/login",
    evaluate: async (fn: { name: string }) => {
      if (fn.name === "hasVisiblePassword") return !opts.noForm && (!submitted || !!opts.passwordStaysAfterLogin);
      return true; // focusField
    },
    keyboard: {
      type: async (text: string) => { typed.push(text); },
      press: async (key: string) => { pressed.push(key); if (key === "Enter") submitted = true; },
    },
    waitForTimeout: async () => undefined,
  };
  return { page, typed, pressed };
}

beforeEach(() => {
  store.docs.length = 0;
});

describe("knownLoginSite", () => {
  it("узнаёт BilimClass с www и без", () => {
    expect(knownLoginSite("https://www.bilimclass.kz/2026/schedule")).toEqual({ domain: "bilimclass.kz", name: "BilimClass" });
    expect(knownLoginSite("https://bilimclass.kz/login")).toMatchObject({ domain: "bilimclass.kz" });
  });
  it("не трогает чужие сайты", () => {
    expect(knownLoginSite("https://evil.example/login")).toBeNull();
    expect(knownLoginSite("не адрес")).toBeNull();
  });
});

describe("loginWithSavedCredentials", () => {
  it("вводит сохранённые данные и нажимает Enter", async () => {
    await saveCredentials("u1", "bilimclass.kz", "teacher@school.kz", "s3cret-pass");
    const { page, typed, pressed } = fakePage();
    const result = await loginWithSavedCredentials("u1", page as never);
    expect(result).toEqual({ status: "logged-in", domain: "bilimclass.kz", name: "BilimClass" });
    expect(typed).toEqual(["teacher@school.kz", "s3cret-pass"]);
    expect(pressed).toEqual(["Enter"]);
  });

  it("пароль в хранилище зашифрован", async () => {
    await saveCredentials("u1", "bilimclass.kz", "teacher@school.kz", "s3cret-pass");
    const raw = JSON.stringify(store.docs);
    expect(raw).not.toContain("s3cret-pass");
    expect(raw).not.toContain("teacher@school.kz");
  });

  it("без сохранённых данных ничего не вводит", async () => {
    const { page, typed } = fakePage();
    expect(await loginWithSavedCredentials("u2", page as never)).toMatchObject({ status: "no-credentials" });
    expect(typed).toEqual([]);
  });

  it("данные другого пользователя не используются", async () => {
    await saveCredentials("u1", "bilimclass.kz", "a", "b");
    const { page, typed } = fakePage();
    expect((await loginWithSavedCredentials("u3", page as never)).status).toBe("no-credentials");
    expect(typed).toEqual([]);
  });

  it("если форма осталась после входа — данные не приняты, повтор раньше минуты не делается", async () => {
    await saveCredentials("u4", "bilimclass.kz", "login", "wrong");
    const first = fakePage({ passwordStaysAfterLogin: true });
    expect((await loginWithSavedCredentials("u4", first.page as never)).status).toBe("rejected");
    const second = fakePage({ passwordStaysAfterLogin: true });
    expect((await loginWithSavedCredentials("u4", second.page as never)).status).toBe("throttled");
    expect(second.typed).toEqual([]);
  });

  it("на странице без формы входа ничего не делает", async () => {
    await saveCredentials("u5", "bilimclass.kz", "login", "pass");
    const { page, typed } = fakePage({ noForm: true });
    expect((await loginWithSavedCredentials("u5", page as never)).status).toBe("no-form");
    expect(typed).toEqual([]);
  });

  it("на неизвестном сайте ничего не вводит", async () => {
    const { page, typed } = fakePage({ url: "https://evil.example/login" });
    expect((await loginWithSavedCredentials("u1", page as never)).status).toBe("no-form");
    expect(typed).toEqual([]);
  });
});
