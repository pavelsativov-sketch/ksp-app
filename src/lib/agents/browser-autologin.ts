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
  "kundelik.kz": {
    name: "Kundelik.kz",
    loginPath: "/login",
    loginSelector: "input[name='login'], input[type='email'], input[name='username']",
    passwordSelector: "input[type='password']",
    submitSelector: "button[type='submit'], input[type='submit']",
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
