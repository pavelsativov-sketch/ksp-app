/**
 * DOM-разведка страницы браузера ОС.
 *
 * Живёт отдельно от бывшего Vercel Sandbox: браузер рабочей области теперь
 * всегда один (раннер в Vercel Sandbox), а эти два помощника нужны и агенту, и
 * вкладке «Браузер» — они спрашивают страницу напрямую через `evaluate`.
 *
 * Раньше тот же код был в `browser-sandbox.ts` вместе с Playwright-воркером
 * внутри Vercel Sandbox. Из-за него в проекте сосуществовали два браузера:
 * агент жил в микро-VM, учитель — в runner'е, и они не видели друг друга.
 */
import "server-only";

export interface ActiveFieldInfo {
  isEditable: boolean;
  isPassword: boolean;
  tag: string;
  type: string;
  label: string;
  name?: string;
  placeholder?: string;
  value?: string;
  box?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Определяет, какое поле ввода сейчас в фокусе на странице в браузере ОС.
 * Позволяет пользователю вводить логин и пароль напрямую с клавиатуры на экране ОС.
 */
export async function inspectActiveField(page: { evaluate: (fn: () => unknown, arg?: unknown) => Promise<unknown> }): Promise<ActiveFieldInfo> {
  try {
    const info = await page.evaluate((() => {
      let el = document.activeElement as HTMLElement | null;
      try {
        if (el && el.tagName.toLowerCase() === "iframe" && (el as HTMLIFrameElement).contentDocument) {
          const sub = (el as HTMLIFrameElement).contentDocument?.activeElement as HTMLElement | null;
          if (sub && sub !== (el as HTMLIFrameElement).contentDocument?.body) {
            el = sub;
          }
        }
      } catch {}

      if (!el || el === document.body || el === document.documentElement) {
        return { isEditable: false, isPassword: false, tag: "", type: "", label: "" };
      }
      const tag = (el.tagName || "").toLowerCase();
      const input = el as HTMLInputElement;
      const type = (input.type || "").toLowerCase();
      const isEditable =
        tag === "input" ||
        tag === "textarea" ||
        el.isContentEditable ||
        el.getAttribute("role") === "textbox";
      const isPassword = tag === "input" && type === "password";
      const parts: string[] = [];
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel) parts.push(ariaLabel.trim());
      if (el.id) {
        try {
          const lab = document.querySelector<HTMLElement>(`label[for="${CSS.escape(el.id)}"]`);
          if (lab?.innerText) parts.push(lab.innerText.trim());
        } catch {}
      }
      const ph = el.getAttribute("placeholder") || "";
      const name = el.getAttribute("name") || "";
      if (ph) parts.push(ph.trim());
      else if (name) parts.push(name.trim());

      let box: { x: number; y: number; width: number; height: number } | undefined;
      try {
        const r = el.getBoundingClientRect();
        if (r && r.width > 0 && r.height > 0) {
          box = {
            x: Math.round(r.left),
            y: Math.round(r.top),
            width: Math.round(r.width),
            height: Math.round(r.height),
          };
        }
      } catch {}

      let val = "";
      try {
        if ("value" in el && typeof (el as HTMLInputElement).value === "string") {
          val = (el as HTMLInputElement).value;
        } else if (el.isContentEditable) {
          val = el.innerText || "";
        }
      } catch {}

      const fieldLabel = isPassword
        ? (parts.length > 0 ? parts.join(" · ") : "Пароль")
        : (parts.length > 0
            ? parts.join(" · ")
            : (ph || name || (tag === "textarea" ? "Текстовое поле" : "Поле ввода")));

      return {
        isEditable,
        isPassword,
        tag,
        type,
        label: fieldLabel.replace(/\s+/g, " ").slice(0, 80),
        name,
        placeholder: ph,
        // Значение поля пароля наружу не отдаём. Оно уезжает в браузер
        // учителя в заголовке ответа, попадает в состояние React и в журнал
        // сети — то есть лежит открытым текстом там, где его видно при
        // открытых инструментах разработчика. Интерфейсу хватает длины:
        // он рисует точки по ней.
        value: isPassword ? "•".repeat(val.length) : val,
        box,
      };
    }) as never);
    if (info && typeof info === "object") return info as ActiveFieldInfo;
  } catch {}
  return { isEditable: false, isPassword: false, tag: "", type: "", label: "" };
}

export interface PageAuthBarrier {
  requiresUserAction: boolean;
  kind: "login" | "captcha" | "2fa" | null;
  reason: string;
}

/**
 * Проверяет, есть ли на странице форма входа (логин/пароль), CAPTCHA или 2FA/СМС-код,
 * требующие ручного ввода пользователем в рабочей области ОС.
 */
export async function detectPageAuthBarrier(page: { evaluate: (fn: () => unknown, arg?: unknown) => Promise<unknown> }): Promise<PageAuthBarrier> {
  try {
    const res = await page.evaluate((() => {
      const isVisible = (el: Element | null) => {
        if (!el) return false;
        const r = (el as HTMLElement).getBoundingClientRect?.();
        if (!r || r.width < 8 || r.height < 8) return false;
        const st = window.getComputedStyle(el);
        return st.display !== "none" && st.visibility !== "hidden" && st.opacity !== "0";
      };

      // 1. Проверка CAPTCHA
      const captchaEl = document.querySelector(
        'iframe[src*="recaptcha" i], iframe[src*="turnstile" i], iframe[src*="hcaptcha" i], .g-recaptcha, .cf-turnstile, .h-captcha, [id*="captcha" i]',
      );
      if (isVisible(captchaEl)) {
        return {
          requiresUserAction: true,
          kind: "captcha",
          reason: "На странице требуется пройти проверку CAPTCHA («Я не робот») в рабочей области ОС",
        };
      }

      // 2. Проверка 2FA / одноразового кода из СМС
      const inputs = Array.from(document.querySelectorAll("input")).filter(isVisible);
      for (const inp of inputs) {
        const meta = `${inp.autocomplete || ""} ${inp.name || ""} ${inp.id || ""} ${inp.placeholder || ""} ${inp.getAttribute("aria-label") || ""}`.toLowerCase();
        if (/one-time-code|otp|2fa|код из смс|sms.?код|код подтверждения|проверочный код/i.test(meta)) {
          return {
            requiresUserAction: true,
            kind: "2fa",
            reason: "На странице запрашивается код подтверждения (2FA / СМС) — введите его в рабочей области ОС",
          };
        }
      }

      // 3. Проверка видимого поля пароля (форма входа)
      const hasPassword = inputs.some((inp) => (inp.type || "").toLowerCase() === "password");
      if (hasPassword) {
        return {
          requiresUserAction: true,
          kind: "login",
          reason: "На странице открыта форма входа — введите логин и пароль прямо на экране в рабочей области ОС",
        };
      }

      return { requiresUserAction: false, kind: null, reason: "" };
    }) as never);
    if (res && typeof res === "object") return res as PageAuthBarrier;
  } catch {}
  return { requiresUserAction: false, kind: null, reason: "" };
}