/**
 * Автоматический вход в аккаунты для браузера рабочей области ОС.
 *
 * Хранит учётные данные (логин + пароль) зашифрованными в MongoDB.
 * При переходе на известный домен — автоматически заполняет форму входа.
 */
import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getDb, COL } from "@/lib/mongo";

// ── Шифрование ─────────────────────────────────────────────────────────────

function credKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET слишком короткий для хранения учётных данных");
  return createHash("sha256").update(`mekty-browser-creds:${secret}`).digest();
}

function encryptCred(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", credKey(), iv);
  const ct = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ct.toString("base64url")}`;
}

function decryptCred(encoded: string): string | null {
  try {
    const [version, ivPart, tagPart, bodyPart] = encoded.split(".");
    if (version !== "v1" || !ivPart || !tagPart || !bodyPart) return null;
    const decipher = createDecipheriv("aes-256-gcm", credKey(), Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(bodyPart, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ── Известные сайты с авто-входом ──────────────────────────────────────────

export const KNOWN_LOGIN_SITES: Record<string, {
  name: string;
  loginPath?: string;            // Путь страницы входа (e.g. "/login")
  loginSelector: string;         // CSS-селектор поля логина/email
  passwordSelector: string;      // CSS-селектор поля пароля
  submitSelector: string;        // CSS-селектор кнопки входа
  waitAfterMs?: number;          // Пауза после клика "Войти"
}> = {
  "bilimclass.kz": {
    name: "BilimClass",
    loginPath: "/login",
    loginSelector: "input[name='login'], input[type='email'], input[placeholder*='огин'], input[placeholder*='email']",
    passwordSelector: "input[type='password']",
    submitSelector: "button[type='submit'], button.login-btn, button:has-text('іру'), button:has-text('Войти')",
    waitAfterMs: 2000,
  },
  "bilimland.kz": {
    name: "BilimLand",
    loginPath: "/login",
    loginSelector: "input[name='email'], input[type='email']",
    passwordSelector: "input[type='password']",
    submitSelector: "button[type='submit']",
    waitAfterMs: 2000,
  },
};

// ── MongoDB операции ────────────────────────────────────────────────────────

interface CredDoc {
  user_id: string;
  domain: string;
  username_enc: string;
  password_enc: string;
  updated_at: Date;
}

export async function saveCredentials(userId: string, domain: string, username: string, password: string): Promise<void> {
  const db = await getDb();
  await db.collection<CredDoc>(COL.browserCredentials).updateOne(
    { user_id: userId, domain },
    {
      $set: {
        username_enc: encryptCred(username),
        password_enc: encryptCred(password),
        updated_at: new Date(),
      },
      $setOnInsert: { user_id: userId, domain } as Partial<CredDoc>,
    },
    { upsert: true },
  );
}

export async function deleteCredentials(userId: string, domain: string): Promise<void> {
  const db = await getDb();
  await db.collection(COL.browserCredentials).deleteOne({ user_id: userId, domain });
}

export async function listCredentialDomains(userId: string): Promise<string[]> {
  const db = await getDb();
  const docs = await db.collection(COL.browserCredentials)
    .find({ user_id: userId }, { projection: { domain: 1 } })
    .toArray();
  return docs.map((d) => String(d.domain));
}

export async function getCredentials(userId: string, domain: string): Promise<{ username: string; password: string } | null> {
  const db = await getDb();
  const doc = await db.collection<CredDoc>(COL.browserCredentials)
    .findOne({ user_id: userId, domain });
  if (!doc) return null;
  const username = decryptCred(doc.username_enc);
  const password = decryptCred(doc.password_enc);
  if (!username || !password) return null;
  return { username, password };
}

// ── Вход через страницу (агент и вкладка «Браузер») ─────────────────────────

/** Минимум страницы, нужный для входа: работает и с локальным Playwright, и с удалённым раннером. */
export interface LoginPage {
  url(): string;
  evaluate(fn: (arg: never) => unknown, arg?: unknown): Promise<unknown>;
  keyboard: { type(text: string, opts?: { delay?: number }): Promise<void>; press(key: string): Promise<void> };
  waitForTimeout(ms: number): Promise<void>;
}

export type AutoLoginStatus = "logged-in" | "no-credentials" | "no-form" | "rejected" | "throttled" | "failed";

export interface AutoLoginResult {
  status: AutoLoginStatus;
  domain: string;
  name: string;
}

/** Известный сайт по адресу страницы; null, если автовход для него не настроен. */
export function knownLoginSite(url: string): { domain: string; name: string } | null {
  try {
    const domain = new URL(url).hostname.replace(/^www\./, "");
    const site = KNOWN_LOGIN_SITES[domain];
    return site ? { domain, name: site.name } : null;
  } catch {
    return null;
  }
}

/** Защита от блокировки аккаунта: не чаще одной попытки в минуту на сайт. */
const lastAttempt = new Map<string, number>();
const ATTEMPT_GAP_MS = 60_000;

/** Ставит фокус на поле: по селектору, а для логина — на ближайшее текстовое поле перед паролем. */
const focusField = (arg: { selector: string; kind: "login" | "password" }) => {
  const visible = (el: Element) => {
    const r = (el as HTMLElement).getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 8 && r.height > 8 && st.display !== "none" && st.visibility !== "hidden";
  };
  const all = Array.from(document.querySelectorAll("input")).filter(visible) as HTMLInputElement[];
  let el: HTMLInputElement | undefined;
  if (arg.kind === "password") {
    el = all.find((i) => i.type === "password");
  } else {
    el = (Array.from(document.querySelectorAll(arg.selector)).find(visible) as HTMLInputElement | undefined)
      ?? all.slice(0, Math.max(all.findIndex((i) => i.type === "password"), 0)).reverse().find((i) => ["text", "email", "tel", "number", ""].includes(i.type));
  }
  if (!el) return false;
  el.focus();
  el.select?.();
  return true;
};

const hasVisiblePassword = () =>
  Array.from(document.querySelectorAll("input[type='password']")).some((el) => {
    const r = (el as HTMLElement).getBoundingClientRect();
    return r.width > 8 && r.height > 8;
  });

/**
 * Раннер принимает скрипты только вида «(…)»: после минификации функция с одним
 * параметром превращается в `e=>{…}` без скобок и отклоняется. Оборачиваем сами.
 */
const asScript = (fn: (...args: never[]) => unknown): string => `(${fn.toString()})`;

/**
 * Входит на известном сайте сохранёнными данными. Пароль вводится здесь, на
 * сервере, прямо в страницу: модель его не видит и в ответ он не попадает.
 */
export async function loginWithSavedCredentials(userId: string, page: LoginPage): Promise<AutoLoginResult> {
  const site = knownLoginSite(page.url());
  if (!site) return { status: "no-form", domain: "", name: "" };
  const result = (status: AutoLoginStatus): AutoLoginResult => ({ status, ...site });
  const config = KNOWN_LOGIN_SITES[site.domain]!;
  try {
    // SPA BilimClass рисует форму только после ответов API (до 10–15 с): на странице
    // входа ждём её появления, а не считаем, что формы нет.
    let hasForm = Boolean(await page.evaluate(asScript(hasVisiblePassword) as never));
    const onLoginPath = /\/login/i.test(page.url());
    for (let i = 0; i < 12 && !hasForm && onLoginPath; i += 1) {
      await page.waitForTimeout(1000);
      hasForm = Boolean(await page.evaluate(asScript(hasVisiblePassword) as never));
    }
    if (!hasForm) return result("no-form");
    const creds = await getCredentials(userId, site.domain);
    if (!creds) return result("no-credentials");

    const key = `${userId}:${site.domain}`;
    if (Date.now() - (lastAttempt.get(key) ?? 0) < ATTEMPT_GAP_MS) return result("throttled");
    lastAttempt.set(key, Date.now());

    if (!(await page.evaluate(asScript(focusField) as never, { selector: config.loginSelector, kind: "login" }))) return result("no-form");
    await page.keyboard.type(creds.username, { delay: 15 });
    if (!(await page.evaluate(asScript(focusField) as never, { selector: config.passwordSelector, kind: "password" }))) return result("no-form");
    await page.keyboard.type(creds.password, { delay: 15 });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(config.waitAfterMs ?? 2000);

    // Форма входа всё ещё на месте — сайт не принял данные.
    return result((await page.evaluate(asScript(hasVisiblePassword) as never)) ? "rejected" : "logged-in");
  } catch {
    return result("failed");
  }
}

// ── Основная функция авто-входа ─────────────────────────────────────────────

/**
 * Пытается автоматически войти на сайте если:
 *   1. URL совпадает с известным доменом
 *   2. Для этого домена сохранены учётные данные
 *
 * Возвращает true если вход был выполнен (или предпринята попытка).
 */
export async function tryAutoLogin(
  userId: string,
  currentUrl: string,
  sendRpc: (action: string, args: Record<string, unknown>) => Promise<void>,
): Promise<boolean> {
  let hostname: string;
  try {
    hostname = new URL(currentUrl).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }

  const site = KNOWN_LOGIN_SITES[hostname];
  if (!site) return false;

  // Проверяем: это страница входа?
  const urlPath = new URL(currentUrl).pathname;
  if (site.loginPath && !urlPath.startsWith(site.loginPath)) return false;

  const creds = await getCredentials(userId, hostname);
  if (!creds) return false;

  try {
    // Небольшая пауза — ждём рендер формы
    await sendRpc("wait", { ms: 800 });

    // Заполняем логин
    await sendRpc("fill", { selector: site.loginSelector, value: creds.username });

    // Заполняем пароль
    await sendRpc("fill", { selector: site.passwordSelector, value: creds.password });

    // Нажимаем войти
    await sendRpc("fill", { selector: site.submitSelector, value: "" }); // просто фокус
    await sendRpc("press", { key: "Tab" });
    await sendRpc("press", { key: "Enter" });

    // Либо кликаем кнопку
    await sendRpc("evaluate", {
      script: `() => { const btn = document.querySelector("${site.submitSelector.split(",")[0].trim()}"); if (btn) btn.click(); }`,
    });

    // Ждём загрузки после входа
    if (site.waitAfterMs) await sendRpc("wait", { ms: site.waitAfterMs });

    return true;
  } catch {
    return false;
  }
}
