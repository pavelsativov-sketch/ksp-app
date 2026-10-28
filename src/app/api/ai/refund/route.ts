import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { COL, getDb } from "@/lib/mongo";
import { getPlanForUser, utcMonthWindow } from "@/lib/billing/quota";

export const runtime = "nodejs";

const REFUND_WINDOW_MS = 10 * 60_000;
const REFUNDS_PER_MONTH = 3;

/**
 * Возврат попытки генерации КСП: удаляет последнюю запись генерации
 * (не старше 10 минут) и возвращает слот квоты. Не более 3 возвратов в месяц.
 * Проверка «пользовался ли результатом» невозможна — лимит возвратов
 * сдерживает злоупотребления.
 */
export async function POST() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const rl = await checkRateLimitAsync(`ai:${auth.user.id}`, 30, 3600_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Превышен лимит запросов. Попробуйте позже." }, { status: 429 });
  }

  try {
    const db = await getDb();
    const now = new Date();
    const { start, end } = utcMonthWindow(now);

    const refundsUsed = await db.collection(COL.aiEvents).countDocuments({
      user_id: auth.user.id, task: "generation_refund", createdAt: { $gte: start, $lt: end },
    });
    if (refundsUsed >= REFUNDS_PER_MONTH) {
      return NextResponse.json(
        { error: "Лимит возвратов на месяц исчерпан (3). Напишите нам — разберёмся вручную." },
        { status: 429 },
      );
    }

    // Возвращаем именно слот квоты (kind: "slot"), а не запись истории —
    // иначе расход считался бы дважды (история + слот) и возврат был бы неполным.
    const latest = await db.collection(COL.aiEvents).findOne(
      {
        user_id: auth.user.id,
        task: "generation",
        kind: "slot",
        createdAt: { $gte: new Date(now.getTime() - REFUND_WINDOW_MS) },
      },
      { sort: { createdAt: -1 } },
    );
    if (!latest) {
      return NextResponse.json(
        { error: "Нет свежей генерации для возврата (окно — 10 минут после создания)." },
        { status: 404 },
      );
    }

    await db.collection(COL.aiEvents).deleteOne({ _id: latest._id });
    await db.collection(COL.aiEvents).insertOne({
      user_id: auth.user.id, task: "generation_refund", kind: "refund", ok: true, createdAt: now,
    });

    const usage = await getPlanForUser(auth.user.id);
    return NextResponse.json(
      { ok: true, remaining: usage.kspRemaining },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Возврат временно недоступен." }, { status: 503 });
  }
}
