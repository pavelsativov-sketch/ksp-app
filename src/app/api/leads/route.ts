import { NextResponse } from "next/server";
import { z } from "zod";
import { COL, getDb, isMongoConfigured } from "@/lib/mongo";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimitAsync, clientIp } from "@/lib/rate-limit";
import { log } from "@/lib/logger";
import { notifyAdmins } from "@/lib/mailer";
import type { FeedbackCategory } from "@/lib/feedback";

export const runtime = "nodejs";

const leadSchema = z.object({
  kind: z.enum(["purchase_pro", "school_lead", "support"]),
  name: z.string().trim().min(2, "Укажите имя").max(120),
  contact: z.string().trim().min(5, "Укажите телефон / WhatsApp или email").max(160),
  organization: z.string().trim().max(200).optional(),
  planPeriod: z.enum(["month", "quarter", "year"]).optional(),
  teachersCount: z.number().int().min(1).max(2000).optional(),
  message: z.string().trim().max(3000).optional(),
  /** Honeypot-поле от спам-ботов: должно быть пустым. */
  website: z.string().max(0).optional(),
});

const PERIOD_LABEL: Record<"month" | "quarter" | "year", string> = {
  month: "1 месяц (2 490 ₸)",
  quarter: "Четверть / 3 мес. (5 990 ₸)",
  year: "Учебный год (19 900 ₸)",
};

/**
 * POST /api/leads — приём заявок на покупку Pro, подключение школы и обращений
 * в поддержку (в том числе от незарегистрированных директоров/учителей).
 */
export async function POST(request: Request) {
  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "Сервис временно недоступен" }, { status: 503 });
  }

  const ip = clientIp(request);
  const rl = await checkRateLimitAsync(`leads:post:${ip}`, 6, 10 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Слишком много заявок подряд. Пожалуйста, подождите несколько минут." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный формат запроса" }, { status: 400 });
  }

  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Проверьте заполнение полей";
    return NextResponse.json({ error: firstIssue }, { status: 400 });
  }

  const data = parsed.data;
  const user = await getCurrentUser().catch(() => null);

  const category: FeedbackCategory =
    data.kind === "purchase_pro"
      ? "purchase_pro"
      : data.kind === "school_lead"
        ? "school_lead"
        : "general";

  const lines: string[] = [];
  if (data.kind === "purchase_pro") {
    lines.push(
      `Заявка на покупку тарифа Учитель Pro: ${PERIOD_LABEL[data.planPeriod ?? "month"]}.`,
    );
  } else if (data.kind === "school_lead") {
    lines.push(
      `Заявка на подключение школы${data.organization ? ` «${data.organization}»` : ""}${
        data.teachersCount ? ` (~${data.teachersCount} учителей)` : ""
      }.`,
    );
  } else {
    lines.push("Обращение через открытую форму поддержки.");
  }
  lines.push(`Контактное лицо: ${data.name}`);
  lines.push(`Связь (WhatsApp / тел. / email): ${data.contact}`);
  if (data.organization && data.kind !== "school_lead") {
    lines.push(`Школа / организация: ${data.organization}`);
  }
  if (data.message) {
    lines.push(`Комментарий: ${data.message}`);
  }

  try {
    const db = await getDb();
    const now = new Date();
    const result = await db.collection(COL.feedback).insertOne({
      user_id: user?.id ?? `guest:${data.contact.toLowerCase().slice(0, 80)}`,
      rating: 5,
      category,
      status: "new",
      contact_name: data.name,
      contact_info: data.contact,
      organization: data.organization || undefined,
      comment: lines.join("\n"),
      created_at: now,
      updated_at: now,
    });

    const insertedId = result.insertedId.toHexString();
    const notifyKind =
      data.kind === "purchase_pro"
        ? "admin_lead_pro"
        : data.kind === "school_lead"
          ? "admin_lead_school"
          : "admin_feedback";
    const titleMap = {
      purchase_pro: "Новая заявка на Учитель Pro",
      school_lead: "Новая заявка на подключение школы",
      support: "Новое обращение в поддержку Mekty",
    } as const;
    await notifyAdmins({
      kind: notifyKind,
      subject: `${titleMap[data.kind]} — Mekty`,
      title: titleMap[data.kind],
      lines,
      href: "/admin?tab=inbox",
      dedupeKey: `lead:${insertedId}`,
    }).catch(() => {});

    return NextResponse.json(
      { ok: true, id: insertedId },
      { status: 201 },
    );
  } catch (error) {
    log.error("Failed to save lead", {
      error: error instanceof Error ? error.message : String(error),
      kind: data.kind,
    });
    return NextResponse.json(
      { error: "Не удалось отправить заявку. Повторите попытку позже." },
      { status: 500 },
    );
  }
}
