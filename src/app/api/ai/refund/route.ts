import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { COL, getDb } from "@/lib/mongo";
import { getPlanForUser, STALE_PENDING_MS, utcMonthWindow } from "@/lib/billing/quota";

export const runtime = "nodejs";

/** Дольше maxDuration роутов генерации (300 с): после этого незавершённый слот точно брошен. */
const REFUND_MIN_AGE_MS = 5 * 60_000;
const REFUNDS_PER_MONTH = 3;

/**
 * Возврат попытки генерации КСП, которая не дала результата: слот остался
 * pending (функцию убили до finalize). Успешные генерации снимают pending,
 * неудачные удаляют слот сами — их вернуть нельзя и не нужно.
 * Один слот (= одна генерация, его _id) возвращается один раз: слот атомарно
 * превращается в маркер возврата. Не более 3 возвратов в месяц.
 * «Результат не подошёл» — это отзыв, а не возврат квоты.
 */
export async function POST() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const rl = await checkRateLimitAsync(`ai-refund:${auth.user.id}`, 20, 3600_000);
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
    // Атомарно: слот превращается в маркер возврата одной операцией,
    // поэтому параллельные запросы не вернут один и тот же слот дважды.
    const events = db.collection(COL.aiEvents);
    const latest = await events.findOneAndUpdate(
      {
        user_id: auth.user.id,
        task: "generation",
        kind: "slot",
        pending: true,
        // Старше STALE_PENDING_MS слот уже не считается в квоте — возвращать нечего.
        createdAt: { $lt: new Date(now.getTime() - REFUND_MIN_AGE_MS), $gte: new Date(now.getTime() - STALE_PENDING_MS) },
      },
      // month/seq снимаем: иначе второй возврат того же номера слота упрётся в уникальный индекс ai_events_quota_slot_unique.
      { $set: { task: "generation_refund", kind: "refund", ok: false, createdAt: now }, $unset: { month: "", seq: "", pending: "" } },
      { sort: { createdAt: -1 } },
    );
    if (!latest) {
      return NextResponse.json(
        { error: "Нет незавершённой генерации для возврата: успешные не возвращаются, неудачные возвращаются автоматически." },
        { status: 404 },
      );
    }

    // Параллельные возвраты разных слотов могли проскочить проверку выше — перепроверяем и откатываем свой.
    const refundsAfter = await events.countDocuments({
      user_id: auth.user.id, task: "generation_refund", createdAt: { $gte: start, $lt: end },
    });
    if (refundsAfter > REFUNDS_PER_MONTH) {
      // Слот возвращаем без seq: номер мог уже занять новый резерв, а учёт квоты идёт по kind: "slot".
      await events.updateOne(
        { _id: latest._id },
        { $set: { task: "generation", kind: "slot", ok: latest.ok, pending: true, createdAt: latest.createdAt } },
      );
      return NextResponse.json(
        { error: "Лимит возвратов на месяц исчерпан (3). Напишите нам — разберёмся вручную." },
        { status: 429 },
      );
    }

    const usage = await getPlanForUser(auth.user.id);
    return NextResponse.json(
      { ok: true, remaining: usage.kspRemaining },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Возврат временно недоступен." }, { status: 503 });
  }
}
