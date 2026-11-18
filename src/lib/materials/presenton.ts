import type { LessonPlanRow } from "@/lib/types/ksp";
import type { DeckSlide } from "./deck-types";

export const PRESENTON_TEMPLATES = [
  "modern",
  "editorial",
  "horizon",
  "mosaic",
  "verdant",
  "nova",
  "general",
] as const;

export type PresentonTemplateId = (typeof PRESENTON_TEMPLATES)[number];

export const PRESENTON_TEMPLATE_LABELS: Record<
  PresentonTemplateId,
  { ru: string; kk: string }
> = {
  modern: { ru: "Современный (Modern)", kk: "Заманауи (Modern)" },
  horizon: { ru: "Светлый школьный (Horizon)", kk: "Жарық мектептік (Horizon)" },
  editorial: { ru: "Академический (Editorial)", kk: "Академиялық (Editorial)" },
  mosaic: { ru: "Яркий для 1–6 кл. (Mosaic)", kk: "Жарқын 1–6 сынып (Mosaic)" },
  verdant: { ru: "Естествознание (Verdant)", kk: "Жаратылыстану (Verdant)" },
  nova: { ru: "Точные науки и IT (Nova)", kk: "Нақты ғылымдар мен IT (Nova)" },
  general: { ru: "Классический (General)", kk: "Классикалық (General)" },
};

const PRESENTON_API_URL = "https://api.presenton.ai/api/v3/presentation/generate";

export function isPresentonConfigured(): boolean {
  return Boolean(process.env.PRESENTON_API_KEY?.trim());
}

export function buildPresentonLessonContent(
  plan: LessonPlanRow,
  subjectName: string,
  customSlides?: DeckSlide[],
): string {
  const c = plan.content;
  const isKz = plan.language === "kz";
  const topic = c.topic || plan.title;

  const lines: string[] = [
    isKz
      ? `Мектеп сабағына арналған оқу презентациясы. Тақырыбы: «${topic}». Пәні: ${subjectName || "Жалпы пән"}, ${plan.grade}-сынып.`
      : `Учебная школьная презентация к уроку. Тема: «${topic}». Предмет: ${subjectName || "Общеобразовательный предмет"}, ${plan.grade} класс.`,
  ];

  if (c.learningObjectives.length > 0) {
    lines.push(
      `${isKz ? "Оқу мақсаттары" : "Цели обучения"}: ${c.learningObjectives.map((o) => `${o.code} ${o.text}`).join("; ")}`,
    );
  }
  if (c.lessonObjectives.length > 0) {
    lines.push(
      `${isKz ? "Сабақ мақсаттары" : "Цели урока"}: ${c.lessonObjectives.join("; ")}`,
    );
  }

  if (customSlides && customSlides.length > 0) {
    lines.push(isKz ? "\nСлайдтар құрылымы:" : "\nСтруктура слайдов учителя:");
    for (const [idx, sl] of customSlides.slice(0, 12).entries()) {
      const bullets = [...sl.steps, ...sl.points, ...sl.options].filter(Boolean).join("; ");
      lines.push(
        `${idx + 1}. ${sl.title}${sl.lead ? ` — ${sl.lead}` : ""}${bullets ? `: ${bullets}` : ""}${sl.takeaway ? ` (${sl.takeaway})` : ""}`,
      );
    }
    return lines.join("\n").slice(0, 8000);
  }

  if (c.stages.beginning.teacherActions || c.stages.beginning.studentActions) {
    lines.push(
      `${isKz ? "Сабақтың басы (қызығушылықты ояту)" : "Начало урока (вызов и актуализация)"}: ${c.stages.beginning.teacherActions} ${c.stages.beginning.studentActions}`,
    );
  }
  if (c.stages.middle.teacherActions || c.stages.middle.studentActions) {
    lines.push(
      `${isKz ? "Сабақтың ортасы (жаңа тақырып пен практика)" : "Середина урока (объяснение темы и практика)"}: ${c.stages.middle.teacherActions} ${c.stages.middle.studentActions}`,
    );
  }
  if (c.assessmentCriteria.length > 0) {
    lines.push(
      `${isKz ? "Бағалау критерийлері" : "Критерии оценивания"}: ${c.assessmentCriteria.join("; ")}`,
    );
  }
  if (c.stages.end.homework || c.stages.end.summary) {
    lines.push(
      `${isKz ? "Қорытынды және үй тапсырмасы" : "Рефлексия и домашнее задание"}: ${c.stages.end.summary ?? ""} ${c.stages.end.homework ?? ""}`,
    );
  }

  return lines.join("\n").slice(0, 8000);
}

export interface PresentonDeckResult {
  buffer: Buffer;
  presentationId: string;
  editUrl: string | null;
  creditsConsumed: number | null;
}

export async function generatePresentonDeck(input: {
  content: string;
  slideCount?: number;
  language: "ru" | "kz";
  template?: PresentonTemplateId;
}): Promise<PresentonDeckResult> {
  const apiKey = process.env.PRESENTON_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("PRESENTON_API_KEY не настроен");
  }

  const nSlides = Math.min(12, Math.max(4, Math.round(input.slideCount ?? 8)));
  const template: PresentonTemplateId =
    input.template && PRESENTON_TEMPLATES.includes(input.template)
      ? input.template
      : "modern";

  const genRes = await fetch(PRESENTON_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: input.content,
      n_slides: nSlides,
      tone: "educational",
      language: input.language === "kz" ? "Kazakh" : "Russian",
      verbosity: "concise",
      standard_template: template,
      include_title_slide: true,
      export_as: "pptx",
    }),
    signal: AbortSignal.timeout(95_000),
  });

  if (!genRes.ok) {
    const errText = await genRes.text().catch(() => "");
    throw new Error(`Presenton API HTTP ${genRes.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await genRes.json()) as {
    presentation_id?: string;
    path?: string;
    edit_path?: string;
    credits_consumed?: number;
  };

  if (!data.path || !data.path.startsWith("https://")) {
    throw new Error("Presenton не вернул безопасную ссылку на .pptx");
  }

  const fileRes = await fetch(data.path, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!fileRes.ok) {
    throw new Error(`Не удалось скачать .pptx из Presenton (HTTP ${fileRes.status})`);
  }

  const buffer = Buffer.from(await fileRes.arrayBuffer());
  if (buffer.length < 1000 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new Error("Скачанный файл Presenton не является корректным архивом .pptx");
  }

  return {
    buffer,
    presentationId: data.presentation_id ?? "",
    editUrl: typeof data.edit_path === "string" ? data.edit_path : null,
    creditsConsumed:
      typeof data.credits_consumed === "number" ? data.credits_consumed : null,
  };
}
