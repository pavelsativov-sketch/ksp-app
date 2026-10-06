import "server-only";

/**
 * Отправка писем через Resend (https://resend.com).
 * Без RESEND_API_KEY — no-op: вызывает возвращают false, вызываемый код
 * переключается на inline-доставку (dev/demo) или сообщение пользователю.
 */

const FROM = process.env.MAIL_FROM ?? "Mekty <onboarding@resend.dev>";

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`[mailer] RESEND_API_KEY не задан — письмо «${subject}» для ${to} не отправлено.`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    if (!res.ok) {
      console.error(`[mailer] Resend error ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[mailer] send failed", error);
    return false;
  }
}