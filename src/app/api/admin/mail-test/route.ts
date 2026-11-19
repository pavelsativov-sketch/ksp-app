import { NextResponse } from "next/server";
import { z } from "zod";
import { AdminError, limitAdmin, requireAdmin } from "@/lib/admin/auth";
import {
  getMailHealth,
  renderMektyEmail,
  sendEmailDetailed,
  sendTelegramAdminAlert,
} from "@/lib/mailer";
import { enqueueNotifications } from "@/lib/notifications";

export const runtime = "nodejs";

const bodySchema = z.object({
  channel: z.enum(["email", "telegram", "in_app"]),
  to: z.string().email("Укажите корректный email").optional(),
});

/**
 * POST /api/admin/mail-test — живая проверка доставки писем (Resend),
 * Telegram-алертов и встроенных уведомлений прямо из админ-панели.
 */
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    await limitAdmin(admin.id, "create");

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? "Некорректные параметры" },
        { status: 400 },
      );
    }

    const { channel, to } = parsed.data;
    const health = getMailHealth();

    if (channel === "in_app") {
      await enqueueNotifications([
        {
          user_id: admin.id,
          kind: "admin_feedback",
          href: "/admin?tab=ai",
          dedupe_key: `admin_test:${admin.id}:${Date.now()}`,
        },
      ]);
      return NextResponse.json({
        ok: true,
        channel,
        detail: "Тестовое уведомление отправлено на ваш колокольчик в шапке сайта.",
        health,
      });
    }

    if (channel === "telegram") {
      const res = await sendTelegramAdminAlert(
        `✅ Тестовое уведомление Mekty\nАдминистратор: ${admin.email}\nВремя: ${new Date().toLocaleString("ru-RU")}`,
      );
      if (!res.ok) {
        return NextResponse.json(
          { ok: false, channel, error: res.error ?? "Не удалось отправить сообщение в Telegram", health },
          { status: 400 },
        );
      }
      return NextResponse.json({
        ok: true,
        channel,
        detail: "Тестовое сообщение доставлено в Telegram-чат администратора.",
        health,
      });
    }

    const recipient = to?.trim() || admin.email;
    const baseUrl = process.env.APP_URL?.trim()?.replace(/\/$/, "") || "https://ksp-app-pi.vercel.app";
    const html = renderMektyEmail({
      title: "Проверка почтового шлюза Mekty",
      lines: [
        "Это тестовое письмо из панели администратора Mekty.",
        `Получатель: ${recipient}`,
        `Отправитель: ${health.mailFrom}`,
        "Если вы видите это письмо, транзакционная почта в продакшене работает корректно.",
      ],
      ctaLabel: "Открыть админ-панель",
      ctaUrl: `${baseUrl}/admin?tab=ai`,
    });
    const res = await sendEmailDetailed(recipient, "Тест почты — Mekty", html);
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, channel, error: res.error ?? "Не удалось отправить письмо", health },
        { status: 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      channel,
      detail: `Тестовое письмо отправлено на ${recipient}${res.id ? ` (id: ${res.id})` : ""}.`,
      health,
    });
  } catch (error) {
    if (error instanceof AdminError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        {
          status: error.status,
          headers: error.retryAfter ? { "Retry-After": String(error.retryAfter) } : undefined,
        },
      );
    }
    return NextResponse.json({ ok: false, error: "Ошибка проверки доставки" }, { status: 500 });
  }
}
