import PptxGenJS from "pptxgenjs";
import type { LessonPlanRow, LessonStage, KspContent } from "@/lib/types/ksp";
import type { InteractiveTask } from "@/lib/ksp/tasks";

/**
 * Build a PowerPoint presentation from a KSP.
 *
 * Slide deck layout (все слайды — для проектора ученикам; слова педагога
 * живут в отдельном документе «Слова педагога» и сюда не выносятся):
 *  1. Title slide (topic, class, teacher, date)
 *  2. Lesson objectives (SMART goals shown to students)
 *  3. Assessment criteria
 *  4. Language objectives (terms + key phrases)
 *  5. Beginning stage (вопросы классу + их работа)
 *  6. Middle stage
 *  7. End stage
 *  8. One slide per interactive task (so the teacher can run them as warm-up/check-in)
 *  9. Reflection
 * 10. Homework
 * 11. Thank-you slide
 *
 * Returns a Node Buffer (zipped .pptx).
 */
export async function buildKspPptx(plan: LessonPlanRow, options: { watermark?: boolean } = {}): Promise<Buffer> {
  const c = plan.content;
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE"; // 13.33 × 7.5 inch
  pres.author = "КСП App";
  pres.company = c.header.school || "—";
  pres.title = plan.title;

  const ACCENT = "1d4ed8"; // blue-700
  const SOFT = "eef2ff"; // indigo-50
  const INK = "0f172a"; // slate-900
  const MUTED = "64748b"; // slate-500

  // ---------- Slide 1: Title ----------
  {
    const s = pres.addSlide();
    s.background = { color: SOFT };
    s.addText(c.topic || plan.title, {
      x: 0.7,
      y: 2.2,
      w: 11.9,
      h: 1.6,
      fontSize: 44,
      bold: true,
      color: INK,
      fontFace: "Calibri",
    });
    s.addText(
      [
        { text: `${plan.grade} класс`, options: { bold: true } },
        { text: subjectLine(plan), options: {} },
      ],
      {
        x: 0.7,
        y: 4.0,
        w: 11.9,
        h: 0.6,
        fontSize: 22,
        color: ACCENT,
      },
    );
    s.addText(metaLine(c), {
      x: 0.7,
      y: 4.7,
      w: 11.9,
      h: 0.5,
      fontSize: 16,
      color: MUTED,
    });
    s.addShape(pres.ShapeType.line, {
      x: 0.7,
      y: 6.0,
      w: 2.5,
      h: 0,
      line: { color: ACCENT, width: 3 },
    });
    s.addText("Краткосрочный план урока", {
      x: 0.7,
      y: 6.2,
      w: 11.9,
      h: 0.4,
      fontSize: 14,
      italic: true,
      color: MUTED,
    });
  }

  // ---------- Slide: Lesson objectives ----------
  if (c.lessonObjectives.length) {
    const s = pres.addSlide();
    addHeader(s, "Цели урока", ACCENT);
    s.addText(
      c.lessonObjectives.map((t) => ({ text: t, options: { bullet: { code: "25CF" } } })),
      bodyOpts(),
    );
  }

  // ---------- Slide: Assessment criteria ----------
  if (c.assessmentCriteria.length) {
    const s = pres.addSlide();
    addHeader(s, "Критерии успеха", ACCENT);
    s.addText(
      c.assessmentCriteria.map((t) => ({ text: t, options: { bullet: { code: "2713" } } })),
      bodyOpts(),
    );
  }

  // ---------- Slide: Language objectives ----------
  if (c.languageObjectives.terms.length || c.languageObjectives.phrases.length) {
    const s = pres.addSlide();
    addHeader(s, "Языковые цели", ACCENT);
    if (c.languageObjectives.terms.length) {
      s.addText("Ключевые термины", {
        x: 0.7,
        y: 1.3,
        w: 11.9,
        h: 0.4,
        fontSize: 18,
        bold: true,
        color: INK,
      });
      s.addText(c.languageObjectives.terms.join(" · "), {
        x: 0.7,
        y: 1.7,
        w: 11.9,
        h: 1.5,
        fontSize: 20,
        color: INK,
      });
    }
    if (c.languageObjectives.phrases.length) {
      s.addText("Ключевые фразы", {
        x: 0.7,
        y: 3.5,
        w: 11.9,
        h: 0.4,
        fontSize: 18,
        bold: true,
        color: INK,
      });
      s.addText(
        c.languageObjectives.phrases.map((t) => ({ text: t, options: { bullet: true } })),
        { x: 0.7, y: 3.9, w: 11.9, h: 3, fontSize: 18, color: INK },
      );
    }
  }

  // ---------- Slides: Stages ----------
  addStageSlide(pres, "Начало урока", c.stages.beginning, ACCENT, INK, MUTED);
  addStageSlide(pres, "Середина урока", c.stages.middle, ACCENT, INK, MUTED);
  addStageSlide(pres, "Конец урока", c.stages.end, ACCENT, INK, MUTED);

  // ---------- Slides: Interactive tasks (one per task, ready for the projector) ----------
  const allTasks: Array<{ stage: string; task: InteractiveTask }> = [];
  for (const [key, label] of [
    ["beginning", "Начало"],
    ["middle", "Середина"],
    ["end", "Конец"],
  ] as const) {
    for (const t of c.stages[key].tasks ?? []) {
      allTasks.push({ stage: label, task: t });
    }
  }
  for (const { stage, task } of allTasks) {
    addTaskSlide(pres, stage, task, ACCENT, INK, MUTED);
  }

  // ---------- Slide: Reflection ----------
  if (c.stages.end.reflectionQuestions?.length) {
    const s = pres.addSlide();
    addHeader(s, "Рефлексия", ACCENT);
    s.addText(
      c.stages.end.reflectionQuestions.map((t) => ({
        text: t,
        options: { bullet: { code: "2753" } },
      })),
      { ...bodyOpts(), fontSize: 26 },
    );
  }

  // ---------- Slide: Homework ----------
  if (c.stages.end.homework) {
    const s = pres.addSlide();
    addHeader(s, "Домашнее задание", ACCENT);
    s.addText(c.stages.end.homework, {
      x: 0.7,
      y: 1.6,
      w: 11.9,
      h: 5,
      fontSize: 28,
      color: INK,
      valign: "top",
    });
  }

  // ---------- Final slide ----------
  {
    const s = pres.addSlide();
    s.background = { color: ACCENT };
    s.addText("Спасибо за урок!", {
      x: 0.7,
      y: 3.0,
      w: 11.9,
      h: 1.5,
      fontSize: 60,
      bold: true,
      color: "ffffff",
      align: "center",
    });
    if (c.stages.end.summary) {
      s.addText(c.stages.end.summary, {
        x: 1.5,
        y: 4.6,
        w: 10.3,
        h: 1.5,
        fontSize: 18,
        color: "e0e7ff",
        align: "center",
      });
    }
  }

  // Пометка бесплатного тарифа на каждом слайде (Pro — без неё).
  if (options.watermark) {
    for (const slide of (pres as unknown as { slides: PptxGenJS.Slide[] }).slides) {
      slide.addText("Создано в Mekty — бесплатный тариф", {
        x: 8.6,
        y: 7.05,
        w: 4.5,
        h: 0.35,
        fontSize: 10,
        color: "94a3b8",
        align: "right",
      });
    }
  }

  const data = (await pres.write({ outputType: "nodebuffer" })) as Buffer;
  return data;
}

// ---------- helpers ----------

function bodyOpts() {
  return {
    x: 0.7,
    y: 1.5,
    w: 11.9,
    h: 5.5,
    fontSize: 24,
    color: "0f172a",
    valign: "top" as const,
    paraSpaceAfter: 6,
  };
}

function addHeader(slide: PptxGenJS.Slide, title: string, accent: string) {
  slide.addShape("rect" as PptxGenJS.ShapeType, {
    x: 0,
    y: 0,
    w: 13.33,
    h: 1,
    fill: { color: accent },
    line: { color: accent, width: 0 },
  });
  slide.addText(title, {
    x: 0.7,
    y: 0.15,
    w: 11.9,
    h: 0.7,
    fontSize: 28,
    bold: true,
    color: "ffffff",
  });
}

function subjectLine(plan: LessonPlanRow): string {
  return plan.content.header.longTermPlanSection
    ? `  ·  ${plan.content.header.longTermPlanSection}`
    : "";
}

function metaLine(c: KspContent): string {
  const parts = [c.header.school, c.header.teacherName, c.header.date].filter(
    (x) => x && x.trim(),
  );
  return parts.join("  ·  ");
}

function addStageSlide(
  pres: PptxGenJS,
  title: string,
  stage: LessonStage,
  accent: string,
  ink: string,
  muted: string,
) {
  const s = pres.addSlide();
  addHeader(s, `${title}${stage.time ? ` · ${stage.time}` : ""}`, accent);

  // Слайды — для проектора ученикам: вопросы классу + их работа.
  // Слова педагога сюда не выносим (они живут в документе «Слова педагога»).
  const questions = stage.keyQuestions ?? [];
  s.addText("Вопросы классу", {
    x: 0.7, y: 1.3, w: 6, h: 0.4, fontSize: 16, bold: true, color: muted,
  });
  s.addText(
    questions.length
      ? questions.map((q) => ({ text: q, options: { bullet: { code: "2753" } } }))
      : [{ text: "Что вы уже знаете по теме?", options: {} }],
    { x: 0.7, y: 1.75, w: 6, h: 3.2, fontSize: 18, color: ink, valign: "top", paraSpaceAfter: 8 },
  );

  const stageTasks = stage.tasks ?? [];
  s.addText("Работаем", {
    x: 6.9, y: 1.3, w: 5.7, h: 0.4, fontSize: 16, bold: true, color: muted,
  });
  if (stageTasks.length) {
    s.addText(
      stageTasks.slice(0, 3).map((t, i) => ({
        text: `${i + 1}. ${t.question}`,
        options: { bullet: false },
      })),
      { x: 6.9, y: 1.75, w: 5.7, h: 3.2, fontSize: 18, color: ink, valign: "top", paraSpaceAfter: 8 },
    );
  } else {
    s.addText(summarizeStudentActions(stage.studentActions), {
      x: 6.9, y: 1.75, w: 5.7, h: 3.2, fontSize: 18, color: ink, valign: "top",
    });
  }

  const bottom: Array<{ text: string; options?: object }> = [];
  if (stage.descriptors?.length) {
    bottom.push({ text: `Оцениваем: ${stage.descriptors.slice(0, 3).join(" · ")}` });
  }
  if (stage.resources) {
    bottom.push({ text: `Нужно: ${truncate(stage.resources, 120)}` });
  }
  if (bottom.length) {
    s.addText(bottom, { x: 0.7, y: 5.3, w: 11.9, h: 1.4, fontSize: 14, italic: true, color: muted, valign: "top" });
  }
}

/** Короткая выжимка действий учеников для слайда (первые 2 предложения). */
function summarizeStudentActions(actions: string): string {
  const clean = actions.replace(/\s+/g, " ").trim();
  if (!clean) return "—";
  const sentences = clean.match(/[^.!?…]+[.!?…]+/g) ?? [clean];
  return truncate(sentences.slice(0, 2).join(" ").trim(), 280);
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}…` : clean;
}

function addTaskSlide(
  pres: PptxGenJS,
  stageLabel: string,
  task: InteractiveTask,
  accent: string,
  ink: string,
  muted: string,
) {
  const s = pres.addSlide();
  addHeader(s, `${stageLabel} · Задание`, accent);
  s.addText(task.question || "—", {
    x: 0.7,
    y: 1.4,
    w: 11.9,
    h: 1.5,
    fontSize: 30,
    bold: true,
    color: ink,
    valign: "top",
  });

  switch (task.type) {
    case "MCQ": {
      const items = task.options.map((opt, i) => ({
        text: `${String.fromCharCode(0x0410 + i)}. ${opt}`,
        options: { bullet: false, fontSize: 22, color: ink },
      }));
      s.addText(items, {
        x: 1.0,
        y: 3.2,
        w: 11.5,
        h: 3.5,
        fontSize: 22,
        color: ink,
        valign: "top",
        paraSpaceAfter: 10,
      });
      break;
    }
    case "TRUE_FALSE": {
      s.addText("Верно   /   Неверно", {
        x: 0.7,
        y: 3.5,
        w: 11.9,
        h: 1,
        fontSize: 36,
        bold: true,
        align: "center",
        color: accent,
      });
      break;
    }
    case "FILL_BLANK": {
      s.addText(task.template, {
        x: 0.7,
        y: 3.2,
        w: 11.9,
        h: 2,
        fontSize: 26,
        italic: true,
        color: ink,
        valign: "top",
      });
      break;
    }
    case "MATCHING": {
      const left = task.left.map((x) => ({ text: x, options: { bullet: true } }));
      const right = task.right.map((x) => ({ text: x, options: { bullet: true } }));
      s.addText(left, { x: 0.7, y: 3.2, w: 5.8, h: 3.5, fontSize: 18, color: ink });
      s.addText(right, { x: 6.9, y: 3.2, w: 5.7, h: 3.5, fontSize: 18, color: ink });
      break;
    }
    case "ORDERING": {
      s.addText(
        task.items.map((x) => ({ text: x, options: { bullet: { code: "2192" } } })),
        { x: 0.7, y: 3.2, w: 11.9, h: 3.5, fontSize: 20, color: ink },
      );
      break;
    }
    case "NUMERIC": {
      s.addText(`Число${task.unit ? ` (${task.unit})` : ""}: ____`, {
        x: 0.7,
        y: 3.5,
        w: 11.9,
        h: 1,
        fontSize: 28,
        align: "center",
        color: ink,
      });
      break;
    }
    case "SHORT_ANSWER": {
      s.addText("Ответ: ________________________________", {
        x: 0.7,
        y: 3.5,
        w: 11.9,
        h: 1,
        fontSize: 22,
        color: ink,
      });
      break;
    }
  }

  if (task.hint) {
    s.addText(`Подсказка: ${task.hint}`, {
      x: 0.7,
      y: 6.7,
      w: 11.9,
      h: 0.5,
      fontSize: 14,
      italic: true,
      color: muted,
    });
  }
}
