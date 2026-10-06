import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { getPlanById, getSubjectById } from "@/lib/plans-repo";
import { buildKtp, ktpRequestSchema } from "@/lib/ktp";
import { buildKtpDocx } from "@/lib/export/ktp-docx";
import { resolveWatermark } from "@/lib/billing/watermark";
import { getPlanForUser } from "@/lib/billing/quota";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 64 * 1024;
const headers = { "Cache-Control": "no-store" };
const errorResponse = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

export async function POST(request: Request) {
  try {
    const auth = await requireApiAuth();
    if (auth.response) {
      auth.response.headers.set("Cache-Control", "no-store");
      return auth.response;
    }

    // КТП — фича тарифа Pro (см. PLANS.free.limits.ktp).
    try {
      const usage = await getPlanForUser(auth.user.id);
      if (usage.limits.ktp !== true) {
        return errorResponse("Календарно-тематический план доступен на тарифе Pro.", 403);
      }
    } catch {
      return errorResponse("Проверка тарифа временно недоступна.", 503);
    }

    // Bound the actual stream, not just the untrusted Content-Length header.
    if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
      return errorResponse("Слишком большой запрос", 413);
    }
    let json: unknown;
    try {
      const reader = request.body?.getReader();
      if (!reader) return errorResponse("Invalid JSON", 400);
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let size = 0;
      let text = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BODY_BYTES) {
            void reader.cancel().catch(() => {});
            return errorResponse("Слишком большой запрос", 413);
          }
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        reader.releaseLock();
      }
      json = JSON.parse(text);
    } catch {
      return errorResponse("Invalid JSON", 400);
    }
    const parsed = ktpRequestSchema.safeParse(json);
    if (!parsed.success) return errorResponse("Некорректные параметры КТП", 400);

    const plan = await getPlanById(parsed.data.planId);
    // Do not disclose another owner's plan, even if public or unlisted.
    if (!plan || plan.owner_id !== auth.user.id) return errorResponse("Not found", 404);
    const subject = plan.subject_id ? await getSubjectById(plan.subject_id) : null;
    const subjectName = subject ? (plan.language === "kz" ? subject.name_kz || subject.name_ru : subject.name_ru) : "";
    const ktp = buildKtp(plan, subjectName, parsed.data);
    const watermark = await resolveWatermark(auth.user);
    const buffer = await buildKtpDocx(ktp, { watermark });
    return NextResponse.json({ ktp, docxBase64: buffer.toString("base64") }, { headers });
  } catch {
    return errorResponse("Не удалось создать КТП. Попробуйте ещё раз.", 500);
  }
}
