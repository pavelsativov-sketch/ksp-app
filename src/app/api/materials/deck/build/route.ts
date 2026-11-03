import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { getPlanById, getSubjectById } from "@/lib/plans-repo";
import { handoutQuota } from "@/lib/ai/quota-bridge";
import { resolveWatermark } from "@/lib/billing/watermark";
import { buildDeckPptx, type SlideImages } from "@/lib/export/deck-pptx";
import { illustrate } from "@/lib/handouts/images";
import { DECK_THEMES, deckSlidesSchema, type DeckSlide } from "@/lib/materials/deck-types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_IMAGES = 6;

const bodySchema = z.object({
  planId: z.string().regex(/^[0-9a-f]{24}$/i),
  theme: z.enum(DECK_THEMES),
  slides: deckSlidesSchema,
});

const IMAGE_STYLE = "Vibrant modern educational illustration for a classroom presentation, clean composition, soft lighting, rich colours. Absolutely no text, letters or numbers in the image.";

/** Шаг 2 конструктора: слайды учителя превращаются в файл PowerPoint с анимацией и картинками. */
export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const rl = await checkRateLimitAsync(`print:${auth.user.id}`, 60, 3600_000);
  if (!rl.ok) return NextResponse.json({ error: "Превышен лимит запросов. Попробуйте позже." }, { status: 429 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Проверьте слайды: у каждого должен быть заголовок." }, { status: 400 });

  const plan = await getPlanById(parsed.data.planId);
  if (!plan || plan.owner_id !== auth.user.id) return NextResponse.json({ error: "План не найден среди ваших планов" }, { status: 404 });

  try {
    const subject = plan.subject_id ? await getSubjectById(plan.subject_id) : null;
    const wanted = parsed.data.slides.filter((slide) => slide.imagePrompt).slice(0, MAX_IMAGES);
    const images: SlideImages = new Map();
    const quota = handoutQuota(auth.user.id);
    const result = await illustrate<DeckSlide>(
      wanted,
      { topic: plan.content.topic || plan.title, subject: subject?.name_ru ?? "", grade: plan.grade },
      (slide) => `${slide.imagePrompt}. ${IMAGE_STYLE}`,
      (slide, image) => {
        images.set(slide.id, image);
        return slide;
      },
      () => quota.reserve("image"),
    );
    const buffer = await buildDeckPptx(
      { title: plan.content.topic || plan.title, theme: parsed.data.theme, slides: parsed.data.slides },
      { images, watermark: await resolveWatermark(auth.user) },
    );
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`Презентация - ${plan.content.topic || plan.title}.pptx`)}`,
        "Cache-Control": "no-store",
        "X-Deck-Images": `${result.created}/${wanted.length}`,
      },
    });
  } catch (error) {
    console.error("Deck build failed", error);
    return NextResponse.json({ error: "Не удалось собрать презентацию. Попробуйте ещё раз." }, { status: 502 });
  }
}
