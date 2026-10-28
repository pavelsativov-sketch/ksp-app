/**
 * Определение «нужен вход / CAPTCHA / код из СМС».
 *
 * Агент вставал на паузу «введите логин и пароль» на страницах без всякой формы
 * входа: подстрока `otp` совпадала с «rootPath» и «footprint», а любой элемент
 * с «captcha» в id считался проверкой, даже скрытый в разметке или служебный.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectPageAuthBarrier } from "@/lib/agents/browser-dom";

/** Страница, выполняющая функцию прямо в jsdom: «видимыми» считаем все элементы с размером. */
const page = {
  evaluate: async (fn: () => unknown) => fn(),
};

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    width: 200, height: 30, top: 0, left: 0, right: 200, bottom: 30, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect);
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("detectPageAuthBarrier", () => {
  it("обычный поиск и поле «rootPath» не считаются кодом из СМС", async () => {
    document.body.innerHTML = '<input name="q" placeholder="Search"><input id="rootPath" name="footprint">';
    expect((await detectPageAuthBarrier(page)).requiresUserAction).toBe(false);
  });

  it("настоящее поле одноразового кода определяется", async () => {
    document.body.innerHTML = '<input autocomplete="one-time-code"><input name="user_otp">';
    const result = await detectPageAuthBarrier(page);
    expect(result).toMatchObject({ requiresUserAction: true, kind: "2fa" });
  });

  it("отдельное слово otp в имени поля — это код", async () => {
    document.body.innerHTML = '<input name="user_otp">';
    expect((await detectPageAuthBarrier(page)).kind).toBe("2fa");
  });

  it("форма с видимым паролем — это вход", async () => {
    document.body.innerHTML = '<input type="text" name="login"><input type="password" name="pw">';
    expect((await detectPageAuthBarrier(page)).kind).toBe("login");
  });

  it("служебный элемент с «captcha» в id, не являющийся проверкой, не останавливает агента", async () => {
    document.body.innerHTML = '<div id="no-captcha-needed">Проверка не требуется</div>';
    expect((await detectPageAuthBarrier(page)).requiresUserAction).toBe(false);
  });

  it("виджет reCAPTCHA определяется", async () => {
    document.body.innerHTML = '<div class="g-recaptcha"></div>';
    expect((await detectPageAuthBarrier(page)).kind).toBe("captcha");
  });
});
