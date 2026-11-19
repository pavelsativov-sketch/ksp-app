import "server-only";

import { COL, getDb, isMongoConfigured, toObjectId } from "@/lib/mongo";
import { enqueueNotifications } from "@/lib/notifications";
import type { AppNotificationKind } from "@/lib/notification-types";
import { renderMektyEmail } from "@/lib/mail-template";

export { escapeHtml, renderMektyEmail } from "@/lib/mail-template";

/**
 * Продакшен-доставка писем и уведомлений:
 * 1) Email через Resend (`RESEND_API_KEY`, `MAIL_FROM`)
 * 2) Telegram-оповещения администраторам (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`)
 * 3) Встроенные in-app уведомления в MongoDB (`COL.notifications`, работают всегда)
 */

export interface MailHealth {
  emailConfigured: boolean;
  mailFrom: string;
  customSender: boolean;
  appUrlConfigured: boolean;
  telegramConfigured: boolean;
  adminIdsCount: number;
}

export function getMailFrom(): string {
  return process.env.MAIL_FROM?.trim() || "Mekty <onboarding@resend.dev>";
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function isTelegramAdminConfigured(): boolean {
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_ADMIN_CHAT_ID?.trim(),
  );
}

export function getAdminUserIds(): string[] {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => /^[a-f\d]{24}$/i.test(v));
}

export function getMailHealth(): MailHealth {
  const mailFrom = getMailFrom();
  return {
    emailConfigured: isEmailConfigured(),
    mailFrom,
    customSender: Boolean(process.env.MAIL_FROM?.trim()),
    appUrlConfigured: Boolean(process.env.APP_URL?.trim()),
    telegramConfigured: isTelegramAdminConfigured(),
    adminIdsCount: getAdminUserIds().length,
  };
}

export async function sendEmailDetailed(
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    console.warn(`[mailer] RESEND_API_KEY не задан — письмо «${subject}» для ${to} не отправлено.`);
    return { ok: false, error: "RESEND_API_KEY не задан в переменных окружения" };
  }
  const from = getMailFrom();
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[mailer] Resend error ${res.status}: ${text}`);
      return { ok: false, error: `Resend HTTP ${res.status}: ${text.slice(0, 240)}` };
    }
    let id: string | undefined;
    try {
      const parsed = JSON.parse(text) as { id?: string };
      id = parsed.id;
    } catch {
      /* ignore */
    }
    return { ok: true, id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[mailer] send failed", error);
    return { ok: false, error: message };
  }
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const res = await sendEmailDetailed(to, subject, html);
  return res.ok;
}

export async function sendTelegramAdminAlert(
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();
  if (!token || !chatId) {
    return {
      ok: false,
      error: "TELEGRAM_BOT_TOKEN или TELEGRAM_ADMIN_CHAT_ID не заданы",
    };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 3900),
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[telegram-alert] HTTP ${res.status}: ${detail}`);
      return { ok: false, error: `Telegram HTTP ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function resolveAdminAlertEmails(): Promise<string[]> {
  const explicit = (process.env.ADMIN_ALERT_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter((e) => e.includes("@"));
  if (explicit.length > 0) return explicit;
  if (!isMongoConfigured()) return [];
  const ids = getAdminUserIds()
    .map(toObjectId)
    .filter((id): id is NonNullable<typeof id> => id !== null);
  if (ids.length === 0) return [];
  try {
    const db = await getDb();
    const docs = await db
      .collection<{ email?: string }>(COL.users)
      .find({ _id: { $in: ids } })
      .project<{ email?: string }>({ email: 1, _id: 0 })
      .toArray();
    return docs.map((d) => d.email?.trim() ?? "").filter((e) => e.includes("@"));
  } catch {
    return [];
  }
}

/**
 * Доставляет оперативное оповещение администраторам по всем активным каналам:
 * in-app колокольчик (всегда), Telegram-бот (если настроен) и Resend email (если настроен).
 */
export async function notifyAdmins(opts: {
  kind: AppNotificationKind;
  subject: string;
  title: string;
  lines: string[];
  href: string;
  dedupeKey: string;
}): Promise<{ inApp: number; email: boolean; telegram: boolean }> {
  const adminIds = getAdminUserIds();
  let inApp = 0;

  if (adminIds.length > 0 && isMongoConfigured()) {
    await enqueueNotifications(
      adminIds.map((userId) => ({
        user_id: userId,
        kind: opts.kind,
        href: opts.href,
        dedupe_key: opts.dedupeKey,
      })),
    );
    inApp = adminIds.length;
  }

  const baseUrl = process.env.APP_URL?.trim()?.replace(/\/$/, "") || "https://ksp-app-pi.vercel.app";
  const ctaUrl = opts.href.startsWith("/") ? `${baseUrl}${opts.href}` : baseUrl;

  let telegramOk = false;
  if (isTelegramAdminConfigured()) {
    const tgText = [`🔔 ${opts.title}`, ...opts.lines, "", `Открыть: ${ctaUrl}`].join("\n");
    const tg = await sendTelegramAdminAlert(tgText);
    telegramOk = tg.ok;
  }

  let emailOk = false;
  if (isEmailConfigured()) {
    const recipients = await resolveAdminAlertEmails();
    if (recipients.length > 0) {
      const html = renderMektyEmail({
        title: opts.title,
        lines: opts.lines,
        ctaLabel: "Открыть в админ-панели",
        ctaUrl,
      });
      const results = await Promise.all(
        recipients.slice(0, 3).map((to) => sendEmailDetailed(to, opts.subject, html)),
      );
      emailOk = results.some((r) => r.ok);
    }
  }

  return { inApp, email: emailOk, telegram: telegramOk };
}
