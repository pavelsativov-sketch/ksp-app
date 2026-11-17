import { NextResponse } from "next/server";
import JSZip from "jszip";
import * as docxExport from "@/lib/export/docx";
import { buildInteractiveHtml, buildReadme } from "@/lib/export/html";
import { buildKspPptx } from "@/lib/export/pptx";
import { buildDeckPptx } from "@/lib/export/deck-pptx";
import { buildHandoutDocx } from "@/lib/handouts/docx";
import { buildGroupWorkDocx } from "@/lib/handouts/group-work-docx";
import { toOopSheet } from "@/lib/handouts/oop";
import type { Handout } from "@/lib/handouts/types";
import type { GroupWork } from "@/lib/handouts/group-work";
import type { DeckSlide, DeckTheme } from "@/lib/materials/deck-types";
import { listFullPlanMaterials } from "@/lib/materials/plan-materials";
import { getAccessiblePlan } from "@/lib/plans-repo";
import { getCurrentUser } from "@/lib/auth";
import { isMongoConfigured } from "@/lib/mongo";
import { resolveWatermark } from "@/lib/billing/watermark";
import { checkRateLimitAsync, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "Сервер не настроен" }, { status: 500 });
  }

  const user = await getCurrentUser();
  const rl = await checkRateLimitAsync(`export:zip:${user?.id || clientIp(request)}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Слишком много скачиваний. Повторите через минуту." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const plan = await getAccessiblePlan(id, user?.id ?? null);
  if (!plan) {
    return NextResponse.json({ error: "План не найден" }, { status: 404 });
  }

  const zip = new JSZip();
  const watermark = await resolveWatermark(user);

  // Без перехвата сбой сборки уходил пустым 500, и учитель не понимал, что делать.
  let zipBuffer: Buffer;
  try {
    // 1. Основной КСП (обязательный файл архива)
    const docxBuffer = await docxExport.buildKspDocx(plan, { watermark });
    zip.file("plan.docx", new Uint8Array(docxBuffer));

    const extraReadmeLines: string[] = [];

    // 2. Сценарий речи учителя (слова педагога по этапам)
    if (typeof docxExport.buildTeacherScriptDocx === "function" && plan.content?.stages) {
      try {
        const scriptBuf = await docxExport.buildTeacherScriptDocx(plan, { watermark });
        zip.file("teacher-script.docx", new Uint8Array(scriptBuf));
        extraReadmeLines.push("- teacher-script.docx    — подробный сценарий речи педагога по этапам");
      } catch (err) {
        console.warn("[export/zip] пропуск teacher-script.docx", err);
      }
    }

    // 3. Сохранённые материалы комплекта урока (рабочий лист, ООП, карточки, кроссворд, слайды)
    let savedMaterials: Awaited<ReturnType<typeof listFullPlanMaterials>> = [];
    if (plan.owner_id && /^[0-9a-f]{24}$/i.test(plan.id)) {
      try {
        savedMaterials = await listFullPlanMaterials(plan.id, plan.owner_id);
      } catch (err) {
        console.warn("[export/zip] не удалось прочитать материалы комплекта", err);
      }
    }

    let deckSaved = false;
    for (const mat of savedMaterials) {
      try {
        if (mat.kind === "deck") {
          const payload = mat.payload as { slides?: DeckSlide[]; theme?: DeckTheme } | null;
          if (payload?.slides && payload.slides.length > 0) {
            const pptxBuf = await buildDeckPptx(
              {
                title: plan.content?.topic || plan.title,
                theme: payload.theme ?? "network",
                slides: payload.slides,
              },
              { watermark },
            );
            zip.file("presentation.pptx", new Uint8Array(pptxBuf));
            extraReadmeLines.push("- presentation.pptx      — презентация конструктора слайдов урока");
            deckSaved = true;
          }
          continue;
        }

        if (mat.kind === "group_cards" || mat.kind === "pair_cards") {
          const work = mat.payload as GroupWork | null;
          if (work?.cards && Array.isArray(work.cards) && work.cards.length > 0) {
            const cardsBuf = await buildGroupWorkDocx(work, { watermark });
            const fname = mat.kind === "pair_cards" ? "pair-cards.docx" : "group-cards.docx";
            zip.file(fname, new Uint8Array(cardsBuf));
            extraReadmeLines.push(
              `- ${fname.padEnd(22)} — карточки ${mat.kind === "pair_cards" ? "парной" : "групповой"} работы`,
            );
          }
          continue;
        }

        if (mat.kind === "worksheet" || mat.kind === "flashcards" || mat.kind === "crossword") {
          const sheet = mat.payload as { handout?: Handout; docxBase64?: string } | null;
          if (sheet?.handout) {
            const buf = await buildHandoutDocx(sheet.handout, { watermark });
            const fname = `${mat.kind}.docx`;
            zip.file(fname, new Uint8Array(buf));
            const label =
              mat.kind === "worksheet"
                ? "рабочий лист с ответами и дескрипторами"
                : mat.kind === "flashcards"
                  ? "карточки-памятки в тетрадь"
                  : "кроссворд по терминам урока";
            extraReadmeLines.push(`- ${fname.padEnd(22)} — ${label}`);

            if (mat.kind === "worksheet" && sheet.handout.kind === "worksheet") {
              const oopBuf = await buildHandoutDocx(toOopSheet(sheet.handout), {
                watermark,
                includeAnswers: false,
              });
              zip.file("worksheet-oop.docx", new Uint8Array(oopBuf));
              extraReadmeLines.push("- worksheet-oop.docx     — адаптированный рабочий лист для учеников с ООП");
            }
          } else if (sheet?.docxBase64) {
            zip.file(`${mat.kind}.docx`, new Uint8Array(Buffer.from(sheet.docxBase64, "base64")));
            extraReadmeLines.push(`- ${(mat.kind + ".docx").padEnd(22)} — раздаточный материал`);
          }
        }
      } catch (err) {
        console.warn(`[export/zip] пропуск материала ${mat.kind}`, err);
      }
    }

    // 4. Автоматическая презентация по КСП, если конструктор слайдов ещё не запускался
    if (!deckSaved && plan.content?.stages) {
      try {
        const autoPptx = await buildKspPptx(plan, { watermark });
        zip.file("presentation.pptx", new Uint8Array(autoPptx));
        extraReadmeLines.push("- presentation.pptx      — презентация по этапам КСП (PowerPoint)");
      } catch (err) {
        console.warn("[export/zip] пропуск авто-презентации", err);
      }
    }

    // 5. interactive.html (self-contained, works via file://)
    zip.file("interactive.html", buildInteractiveHtml(plan, { watermark }));

    // 6. README.txt
    zip.file("README.txt", buildReadme(plan, extraReadmeLines));

    zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
  } catch (err) {
    console.error("[export/zip] сборка не удалась", err);
    return NextResponse.json(
      { error: "Не удалось собрать архив. Попробуйте ещё раз или скачайте документ Word." },
      { status: 500 },
    );
  }

  const filename = `${plan.title || "ksp"}-kit.zip`.replace(/[^\p{L}\p{N}_\-. ]/gu, "_");

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
