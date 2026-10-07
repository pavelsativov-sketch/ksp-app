import PptxGenJS from "pptxgenjs";
import type { LessonPlanRow, LessonStage, KspContent } from "@/lib/types/ksp";
import type { InteractiveTask } from "@/lib/ksp/tasks";

/**
 * Подписи слайдов презентации.
 *
 * Вынесены объектом, потому что раньше заголовки были зашиты по-русски прямо в
 * вызовах `addHeader`, и казахский КСП получал русскую презентацию при
 * казахском содержании. Учитель показывал классу подписи, которых не было в
 * его плане.
 */
type PptxCopy = {
  objectives: string;
  criteria: string;
  languageGoals: string;
  terms: string;
  phrases: string;
  stageBeginning: string;
  stageMiddle: string;
  stageEnd: string;
  reflection: string;
  homework: string;
  thanks: string;
  shortPlan: string;
  questions: string;
  weWork: string;
  taskHint: string;
  matchLeft: string;
  matchRight: string;
  letters: string;
  task: string;
  trueLabel: string;
  falseLabel: string;
  number: string;
  answer: string;
  hintPrefix: string;
};

/** Буквы вариантов ответа в алфавитном порядке для казахского. */
const OPTION_LETTERS = ["А", "Ә", "Б", "В", "Г", "Д", "Е", "Ж", "З", "И"];

const COPY_RU: PptxCopy = {
  objectives: "Цели урока",
  criteria: "Критерии успеха",
  languageGoals: "Языковые цели",
  terms: "Ключевые термины",
  phrases: "Ключевые фразы",
  stageBeginning: "Начало урока",
  stageMiddle: "Середина урока",
  stageEnd: "Конец урока",
  reflection: "Рефлексия",
  homework: "Домашнее задание",
  thanks: "Спасибо за урок!",
  shortPlan: "Краткосрочный план урока",
  questions: "Вопросы классу",
  weWork: "Работаем",
  taskHint: "Подсказка: ответ можно записать в тетради",
  matchLeft: "Слева",
  matchRight: "Справа",
  letters: "Варианты ответа",
  task: "Задание",
  trueLabel: "Верно",
  falseLabel: "Неверно",
  number: "Число",
  answer: "Ответ",
  hintPrefix: "Подсказка: ",
};

const COPY_KZ: PptxCopy = {
  objectives: "Сабақтың мақсаты",
  criteria: "Табысты критерийлері",
  languageGoals: "Тілдік мақсаттар",
  terms: "Негізгі терминдер",
  phrases: "Негізгі сөздер",
  stageBeginning: "Сабақтың басы",
  stageMiddle: "Сабақтың ортасы",
  stageEnd: "Сабақтың соңы",
  reflection: "Рефлексия",
  homework: "Үйге тапсырма",
  thanks: "Сабаққа рақмет!",
  shortPlan: "Сабақтың қысқа жоспары",
  questions: "Сыныпқа сұрақтар",
  weWork: "Жұмыс",
  taskHint: "Жауапты дәптерге жазуға болады",
  matchLeft: "Сол жақта",
  matchRight: "Оң жақта",
  letters: "Жауап нұсқалары",
  task: "Тапсырма",
  trueLabel: "Дұрыс",
  falseLabel: "Қате",
  number: "Сан",
  answer: "Жауап",
  hintPrefix: "Нұсқау: ",
};

/**
 * Build a PowerPoint presentation from a KSP.
 *
 * Slide deck layout (все слайды — для проектора ученикам; слова педагога
 * живут в отдельном документе «Слова педагога» и сюда не выносятся).
 * Слайды добавляются по содержимому: пустой этап слайда не создаёт,
 * задания дают по слайду на каждое:
 *  1. Title slide (topic, class, teacher, date)
 *  2. Lesson objectives (SMART goals shown to students)
 *  3. Assessment criteria
 *  4. Language objectives (terms + key phrases)
 *  5–7. Stages — только заполненные
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

  // Заголовки слайдов на языке плана. Раньше они были зашиты по-русски, и
  // казахский КСП получал презентацию с русскими подписями при казахском
  // содержании — учитель показывал классу не то, что планировал.
  const T = plan.language === "kz" ? COPY_KZ : COPY_RU;

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
    // Подзаголовок собирается из того, что реально есть. Раньше класс
    // подставлялся шаблоном безусловно, и план без класса давал на титуле
    // «undefined класс» — прямо на первом слайде, который учитель показывает
    // классу в первую очередь.
    const subtitle = [gradeLine(plan), subjectLine(plan)].filter(Boolean).join("");
    if (subtitle) {
      s.addText(
        [
          { text: gradeLine(plan), options: { bold: true } },
          { text: subjectLine(plan), options: {} },
        ],
        {
          x: 0.7,
          y: 4.0,
          w: 11.9,
          h: 0.6,
          fontSize: 22,
          color: ACCENT,
          fit: "shrink",
          shrinkText: true,
        },
      );
    }
    if (metaLine(c)) {
      s.addText(metaLine(c), {
        x: 0.7,
        y: 4.7,
        w: 11.9,
        h: 0.5,
        fontSize: 16,
        color: MUTED,
        fit: "shrink",
        shrinkText: true,
      });
    }
    s.addShape(pres.ShapeType.line, {
      x: 0.7,
      y: 6.0,
      w: 2.5,
      h: 0,
      line: { color: ACCENT, width: 3 },
    });
    s.addText(T.shortPlan, {
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
    addHeader(s, T.objectives, ACCENT);
    s.addText(
      c.lessonObjectives.map((t) => ({ text: t, options: { bullet: { code: "25CF" } } })),
      bodyOpts(),
    );
  }

  // ---------- Slide: Assessment criteria ----------
  if (c.assessmentCriteria.length) {
    const s = pres.addSlide();
    addHeader(s, T.criteria, ACCENT);
    s.addText(
      c.assessmentCriteria.map((t) => ({ text: t, options: { bullet: { code: "2713" } } })),
      bodyOpts(),
    );
  }

  // ---------- Slide: Language objectives ----------
  if (c.languageObjectives.terms.length || c.languageObjectives.phrases.length) {
    const s = pres.addSlide();
    addHeader(s, T.languageGoals, ACCENT);
    if (c.languageObjectives.terms.length) {
      s.addText(T.terms, {
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
        fit: "shrink",
        shrinkText: true,
      });
    }
    if (c.languageObjectives.phrases.length) {
      s.addText(T.phrases, {
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
        { x: 0.7, y: 3.9, w: 11.9, h: 2.4, fontSize: 18, color: INK, fit: "shrink", shrinkText: true },
      );
    }
  }

  // ---------- Slides: Stages ----------
  //
  // Этап без содержания не создаётся. Раньше три слайда добавлялись
  // безусловно, и при неполном плане на проекторе появлялись пустые
  // слайды с текстом «Работаем / —».
  addStageSlide(pres, T.stageBeginning, c.stages.beginning, ACCENT, INK, MUTED, T);
  addStageSlide(pres, T.stageMiddle, c.stages.middle, ACCENT, INK, MUTED, T);
  addStageSlide(pres, T.stageEnd, c.stages.end, ACCENT, INK, MUTED, T);

  // ---------- Slides: Interactive tasks (one per task, ready for the projector) ----------
  const allTasks: Array<{ stage: string; task: InteractiveTask }> = [];
  for (const [key, label] of [
    ["beginning", T.stageBeginning],
    ["middle", T.stageMiddle],
    ["end", T.stageEnd],
  ] as const) {
    for (const t of c.stages[key].tasks ?? []) {
      allTasks.push({ stage: label, task: t });
    }
  }
  for (const { stage, task } of allTasks) {
    addTaskSlide(pres, stage, task, ACCENT, INK, MUTED, T);
  }

  // ---------- Slide: Reflection ----------
  if (c.stages.end.reflectionQuestions?.length) {
    const s = pres.addSlide();
    addHeader(s, T.reflection, ACCENT);
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
    addHeader(s, T.homework, ACCENT);
    s.addText(c.stages.end.homework, {
      x: 0.7,
      y: 1.6,
      w: 11.9,
      h: 4.6,
      fontSize: 28,
      color: INK,
      valign: "top",
      fit: "shrink",
      shrinkText: true,
    });
  }

  // ---------- Final slide ----------
  {
    const s = pres.addSlide();
    s.background = { color: ACCENT };
    s.addText(T.thanks, {
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
        fit: "shrink",
        shrinkText: true,
      });
    }
  }

  // Пометка бесплатного тарифа на каждом слайде (Pro — без неё).
  //
  // Позиция выбрана так, чтобы не наезжать на подсказку задания: раньше
  // подсказка занимала y 6.7–7.2, а знак 7.05–7.4 при x от 8.6 — прямоугольники
  // пересекались, и на слайдах с подсказкой текст ложился поверх текста.
  if (options.watermark) {
    for (const slide of (pres as unknown as { slides: PptxGenJS.Slide[] }).slides) {
      slide.addText("Создано в Mekty — бесплатный тариф", {
        x: 0.7,
        y: 7.02,
        w: 6,
        h: 0.32,
        fontSize: 10,
        // Знак должен читаться и на тёмно-синем финальном слайде, и на
        // белом: серый 94a3b8 на синем 1d4ed8 не читался вовсе.
        color: "ffffff",
        transparency: 35,
        align: "left",
      });
    }
  }

  // Номера слайдов: при 20+ слайдах на проекторе ориентироваться нечем.
  // Ставятся после водяного знака, чтобы оказаться поверх него.
  {
    const slides = (pres as unknown as { slides: PptxGenJS.Slide[] }).slides;
    const total = slides.length;
    slides.forEach((slide, index) => {
      if (total < 2) return;
      slide.addText(`${index + 1} / ${total}`, {
        x: 11.9,
        y: 7.02,
        w: 0.9,
        h: 0.32,
        fontSize: 10,
        color: "ffffff",
        transparency: 40,
        align: "right",
      });
    });
  }

  const data = (await pres.write({ outputType: "nodebuffer" })) as Buffer;
  return data;
}

// ---------- helpers ----------

/**
 * Оформление основного текста слайда.
 *
 * `fit: "shrink"` — обязателен, а не украшение: без него длинные цели,
 * критерии и условия заданий выходили за нижний край слайда, и учитель
 * показывал классу обрезанный текст. PowerPoint сам уменьшит кегль до
 * читаемого размера.
 *
 * `shrinkText: true` включает уменьшение, когда текст формально помещается
 * по высоте блока, но не помещается по ширине строки.
 */
function bodyOpts() {
  return {
    x: 0.7,
    y: 1.5,
    w: 11.9,
    // Нижняя граница — 6.5: ниже начинается подсказка и водяной знак,
    // которые раньше перекрывались текстом.
    h: 4.9,
    fontSize: 24,
    color: "0f172a",
    valign: "top" as const,
    paraSpaceAfter: 6,
    fit: "shrink" as const,
    shrinkText: true,
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

/**
 * Класс на титуле.
 *
 * Возвращает пустую строку, если класс не проставлен, вместо «undefined
 * класс»: значение подставлялось шаблоном напрямую, и планы без класса
 * показывали классу слово `undefined` на первом же слайде.
 */
function gradeLine(plan: LessonPlanRow): string {
  const grade = typeof plan.grade === "number" && Number.isFinite(plan.grade) ? plan.grade : null;
  if (grade === null) return "";
  return plan.language === "kz" ? `${grade}-сынып` : `${grade} класс`;
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
  T: PptxCopy,
) {
  // Пустой этап слайда не создаёт. Раньше три слайда добавлялись
  // безусловно, и при неполном плане на проекторе появлялись пустые
  // слайды с текстом «Работаем / —».
  const questions = stage.keyQuestions ?? [];
  const stageTasks = stage.tasks ?? [];
  const studentLine = summarizeStudentActions(stage.studentActions);
  const hasQuestions = questions.length > 0;
  const hasWork = stageTasks.length > 0 || studentLine !== "—";
  if (!hasQuestions && !hasWork && !stage.descriptors?.length && !stage.resources) return;

  const s = pres.addSlide();
  addHeader(s, `${title}${stage.time ? ` · ${stage.time}` : ""}`, accent);

  // Слайды — для проектора ученикам: вопросы классу + их работа.
  // Слова педагога сюда не выносим (они живут в документе «Слова педагога»).
  const columnOpts = { fontSize: 18, color: ink, valign: "top" as const, fit: "shrink" as const, shrinkText: true };

  if (hasQuestions) {
    s.addText(T.questions, {
      x: 0.7, y: 1.3, w: 6, h: 0.4, fontSize: 16, bold: true, color: muted,
    });
    s.addText(questions.map((q) => ({ text: q, options: { bullet: { code: "2753" } } })), {
      x: 0.7, y: 1.75, w: 6, h: 3.2, paraSpaceAfter: 8, ...columnOpts,
    });
  }

  if (hasWork) {
    s.addText(T.weWork, {
      x: 6.9, y: 1.3, w: 5.7, h: 0.4, fontSize: 16, bold: true, color: muted,
    });
    if (stageTasks.length) {
      s.addText(
        stageTasks.slice(0, 3).map((t, i) => ({
          text: `${i + 1}. ${t.question}`,
          options: { bullet: false },
        })),
        { x: 6.9, y: 1.75, w: 5.7, h: 3.2, paraSpaceAfter: 8, ...columnOpts },
      );
    } else {
      s.addText(studentLine, { x: 6.9, y: 1.75, w: 5.7, h: 3.2, ...columnOpts });
    }
  }

  const bottom: Array<{ text: string; options?: object }> = [];
  if (stage.descriptors?.length) {
    // Дескрипторы раньше склеивались без обрезки, тогда как resources
    // обрезались: длинные критерии вылезали за край слайда. Теперь оба
    // проходят одну обрезку.
    bottom.push({ text: `Оцениваем: ${truncate(stage.descriptors.slice(0, 3).join(" · "), 160)}` });
  }
  if (stage.resources) {
    bottom.push({ text: `Нужно: ${truncate(stage.resources, 120)}` });
  }
  if (bottom.length) {
    s.addText(bottom, {
      x: 0.7, y: 5.3, w: 11.9, h: 1.1, fontSize: 14, italic: true, color: muted,
      valign: "top", fit: "shrink", shrinkText: true,
    });
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
  T: PptxCopy,
) {
  const s = pres.addSlide();
  addHeader(s, `${stageLabel} · ${T.task}`, accent);
  s.addText(task.question || "—", {
    x: 0.7,
    y: 1.4,
    w: 11.9,
    h: 1.5,
    fontSize: 30,
    bold: true,
    color: ink,
    valign: "top",
    fit: "shrink",
    shrinkText: true,
  });

  switch (task.type) {
    case "MCQ": {
      const items = task.options.map((opt, i) => ({
        // Буквы вариантов по алфавиту казахского: Ә стоит второй. Раньше
        // варианты шли А, Б, В, Г…, и в казахской типографике это читалось
        // как ошибка — между А и Б не хватало Ә.
        text: `${OPTION_LETTERS[i] ?? String.fromCharCode(0x0410 + i)}. ${opt}`,
        options: { bullet: false, fontSize: 22, color: ink },
      }));
      s.addText(items, {
        x: 1.0,
        y: 3.2,
        w: 11.5,
        h: 3.2,
        fontSize: 22,
        color: ink,
        valign: "top",
        paraSpaceAfter: 10,
        fit: "shrink",
        shrinkText: true,
      });
      break;
    }
    case "TRUE_FALSE": {
      s.addText(`${T.trueLabel}   /   ${T.falseLabel}`, {
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
        h: 2.4,
        fontSize: 26,
        italic: true,
        color: ink,
        valign: "top",
        fit: "shrink",
        shrinkText: true,
      });
      break;
    }
    case "MATCHING": {
      // Без подписей колонок слайд был нечитаем: две колонки буллетов, и
      // ученик на проекторе не понимал, что их надо соотносить.
      s.addText(T.matchLeft, {
        x: 0.7, y: 3.1, w: 5.8, h: 0.35, fontSize: 15, bold: true, color: muted,
      });
      s.addText(T.matchRight, {
        x: 6.9, y: 3.1, w: 5.7, h: 0.35, fontSize: 15, bold: true, color: muted,
      });
      const left = task.left.map((x, i) => ({ text: `${i + 1}. ${x}`, options: { bullet: false } }));
      const right = task.right.map((x) => ({ text: x, options: { bullet: true } }));
      const opts = { y: 3.5, h: 3.0, fontSize: 18, color: ink, valign: "top" as const, fit: "shrink" as const, shrinkText: true };
      s.addText(left, { x: 0.7, w: 5.8, ...opts });
      s.addText(right, { x: 6.9, w: 5.7, ...opts });
      break;
    }
    case "ORDERING": {
      s.addText(
        task.items.map((x) => ({ text: x, options: { bullet: { code: "2192" } } })),
        {
          x: 0.7, y: 3.2, w: 11.9, h: 3.2, fontSize: 20, color: ink,
          fit: "shrink", shrinkText: true,
        },
      );
      break;
    }
    case "NUMERIC": {
      s.addText(`${T.number}${task.unit ? ` (${task.unit})` : ""}: ____`, {
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
      s.addText(`${T.answer}: ________________________________`, {
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
    // Подсказка поднята на 6.4 и ограничена по высоте: раньше она занимала
    // 6.7–7.2 и наезжала на водяной знак (7.05–7.4 при x от 8.6).
    s.addText(`${T.hintPrefix}${task.hint}`, {
      x: 0.7,
      y: 6.4,
      w: 11.9,
      h: 0.5,
      fontSize: 14,
      italic: true,
      color: muted,
      fit: "shrink",
      shrinkText: true,
    });
  }
}
