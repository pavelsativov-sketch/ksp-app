import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getPlanById, getSubjectById } from "@/lib/plans-repo";
import { reserveQuotaOrResponse } from "@/lib/billing/quota";
import { resolveWatermark } from "@/lib/billing/watermark";
import { buildKspPptx } from "@/lib/export/pptx";
import { deckSlidesSchema } from "@/lib/materials/deck-types";
import {
  PRESENTON_TEMPLATES,
  buildPresentonLessonContent,
  generatePresentonDeck,
  isPresentonConfigured,
} from "@/lib/materials/presenton";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  planId: z.string().regex(/^[0-9a-f]{24}$/i),
  template: z.enum(PRESENTON_TEMPLATES).optional().default("modern"),
  slideCount: z.number().int().min(4).max(12).optional().default(8),
  slides: deckSlidesSchema.optional(),
});

/**
 * POST /api/materials/presenton — генерация дизайнерской .pptx презентации через Presenton Cloud v3
 * с автоматическим резервным переключением на встроенный генератор PowerPoint при исчерпании баланса или сбое сети.
 */
export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const rl = await checkRateLimitAsync(`presenton:${auth.user.id}`, 15, 3600_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Превышен часовой лимит генерации презентаций. Попробуйте позже." },
      { status: 429 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные параметры презентации" },
      { status: 400 },
    );
  }

  const plan = await getPlanById(parsed.data.planId);
  if (!plan || plan.owner_id !== auth.user.id) {
    return NextResponse.json(
      { error: "План урока не найден среди ваших планов" },
      { status: 404 },
    );
  }

  const qGate = await reserveQuotaOrResponse(auth.user, "assist");
  if (qGate) return qGate;

  const topic = plan.content.topic || plan.title || "Урок";
  const filename = `Презентация - ${topic}.pptx`.replace(/[^\p{L}\p{N}_\-. ]/gu, "_");

  if (isPresentonConfigured()) {
    try {
      const subject = plan.subject_id ? await getSubjectById(plan.subject_id) : null;
      const subjectName =
        plan.language === "kz"
          ? subject?.name_kz || subject?.name_ru || ""
          : subject?.name_ru || "";
      const content = buildPresentonLessonContent(plan, subjectName, parsed.data.slides);
      const result = await generatePresentonDeck({
        content,
        slideCount: parsed.data.slideCount,
        language: plan.language === "kz" ? "kz" : "ru",
        template: parsed.data.template,
      });

      return new NextResponse(new Uint8Array(result.buffer), {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
          "Cache-Control": "no-store",
          "X-Deck-Engine": "presenton-v3",
          ...(result.editUrl ? { "X-Presenton-Edit-Url": result.editUrl } : {}),
        },
      });
    } catch (error) {
      log.warn("Presenton generation failed, falling back to local PPTX builder", {
        planId: plan.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  try {
    const watermark = await resolveWatermark(auth.user);
    const fallbackBuffer = await buildKspPptx(plan, { watermark });
    return new NextResponse(new Uint8Array(fallbackBuffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
        "X-Deck-Engine": "local-fallback",
      },
    });
  } catch (error) {
    log.error("Fallback PPTX build failed", {
      planId: plan.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Не удалось собрать презентацию. Попробуйте ещё раз." },
      { status: 502 },
    );
  }
}
