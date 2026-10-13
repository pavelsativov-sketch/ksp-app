import type { KspContent } from "@/lib/types/ksp";

/**
 * Проверка готовности КСП к уроку и печати: цели → задания → баллы →
 * дескрипторы → время → рефлексия. Каждый пункт — ok/warn/fail.
 */

export type QualityStatus = "ok" | "warn" | "fail";

export interface QualityItem {
  id: string;
  label: string;
  status: QualityStatus;
  hint: string;
  /** Подсказка, где исправить. */
  where: string;
}

const nonEmpty = (v: unknown): boolean =>
  Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim().length > 0 : v != null;

export function checkKspQuality(content: KspContent, language: "ru" | "kz" = "ru"): { items: QualityItem[]; score: number } {
  const items: QualityItem[] = [];
  const push = (id: string, label: string, status: QualityStatus, hint: string, where: string) => {
    items.push({ id, label, status, hint, where });
  };

  // Цели и критерии
  const objectives = content.learningObjectives ?? [];
  push(
    "objectives",
    "Цели обучения из ТУП",
    objectives.length > 0 ? "ok" : "fail",
    objectives.length > 0 ? `Выбрано: ${objectives.length}` : "Без целей из программы план не примут на проверку",
    "Вкладка «Цели»",
  );
  push(
    "lesson-objectives",
    "SMART-цели урока",
    content.lessonObjectives.length >= 3 ? "ok" : content.lessonObjectives.length > 0 ? "warn" : "fail",
    content.lessonObjectives.length >= 3 ? `Целей: ${content.lessonObjectives.length}` : "Нужно 3–5 целей «Учащиеся смогут …»",
    "Вкладка «Цели»",
  );
  push(
    "criteria",
    "Измеримые критерии",
    content.assessmentCriteria.filter((criterion) => nonEmpty(criterion)).length >= 3 ? "ok" : content.assessmentCriteria.some((criterion) => nonEmpty(criterion)) ? "warn" : "fail",
    "Каждый критерий — наблюдаемое действие",
    "Вкладка «Цели»",
  );

  // Этапы
  const stages = [
    { key: "beginning" as const, name: "Начало" },
    { key: "middle" as const, name: "Середина" },
    { key: "end" as const, name: "Конец" },
  ];
  for (const { key, name } of stages) {
    const st = content.stages[key];
    if (!st) {
      push(`stage-${key}`, `${name} урока`, "fail", "Этап отсутствует", "Вкладка «Ход урока»");
      continue;
    }
    const filled = [st.teacherActions, st.studentActions, st.resources].filter(nonEmpty).length;
    push(
      `stage-${key}`,
      `${name} урока: сценарий`,
      filled === 3 ? "ok" : filled > 0 ? "warn" : "fail",
      filled === 3 ? "Слова педагога, действия учеников и ресурсы на месте" : "Допишите действия и ресурсы",
      "Вкладка «Ход урока»",
    );
    push(
      `stage-${key}-questions`,
      `${name}: вопросы и дескрипторы`,
      (st.keyQuestions ?? []).length > 0 && (st.descriptors ?? []).length > 0 ? "ok" : "warn",
      "К вопросам и дескрипторам вернутся на проверке",
      "Вкладка «Ход урока»",
    );
  }

  // Баллы: ровно 10 за практику
  const allTasks = [
    ...(content.stages.beginning?.tasks ?? []),
    ...(content.stages.middle?.tasks ?? []),
    ...(content.stages.end?.tasks ?? []),
  ];
  const objectiveCodes = new Set(objectives.map((objective) => objective.code).filter(Boolean));
  const linkedTasks = allTasks.filter((task) => task.objectiveCode && objectiveCodes.has(task.objectiveCode));
  const invalidLinks = allTasks.filter((task) => task.objectiveCode && !objectiveCodes.has(task.objectiveCode));
  const linkedObjectiveCodes = new Set(linkedTasks.map((task) => task.objectiveCode));
  const unlinkedObjectives = objectives.filter((objective) => objective.code && !linkedObjectiveCodes.has(objective.code));
  push(
    "task-objectives",
    language === "kz" ? "Тапсырмалардың оқу мақсаттарымен байланысы" : "Связь заданий с целями обучения",
    invalidLinks.length ? "fail" : allTasks.length > 0 && objectives.length > 0 && linkedTasks.length === allTasks.length ? "ok" : "warn",
    invalidLinks.length
      ? (language === "kz" ? "Оқу бағдарламасында жоқ мақсат коды көрсетілген." : "Указан код цели, которого нет среди целей программы.")
      : allTasks.length === 0
        ? (language === "kz" ? "Мақсаттармен байланысты тексеру үшін тапсырма қосыңыз." : "Добавьте задания, чтобы проверить их связи с целями.")
        : (language === "kz" ? "Тапсырмалардың бәріне бағдарламадағы мақсаттарды таңдаңыз." : "Свяжите каждое задание с существующей целью обучения."),
    language === "kz" ? "Сабақ барысы → тапсырмалар" : "Вкладка «Ход урока» → задания",
  );
  push(
    "objective-coverage",
    language === "kz" ? "Оқу мақсаттарының қамтылуы" : "Покрытие целей заданиями",
    allTasks.length > 0 && objectives.length > 0 && unlinkedObjectives.length === 0 ? "ok" : "warn",
    allTasks.length === 0
      ? (language === "kz" ? "Мақсаттардың тапсырмаларда қолданылғанын тексеру үшін тапсырма қосыңыз." : "Добавьте задания, чтобы проверить, что заявленные цели в них используются.")
      : unlinkedObjectives.length > 0
        ? (language === "kz" ? `Тапсырмалармен байланыспаған мақсаттар: ${unlinkedObjectives.map((objective) => objective.code).join(", ")}` : `Не связаны с заданиями: ${unlinkedObjectives.map((objective) => objective.code).join(", ")}`)
        : (language === "kz" ? "Әр оқу мақсаты кемінде бір тапсырмамен қамтылған." : "Каждая цель обучения связана хотя бы с одним заданием."),
    language === "kz" ? "Сабақ барысы → тапсырмалар" : "Вкладка «Ход урока» → задания",
  );
  const criteria = content.assessmentCriteria.map((criterion) => criterion.trim()).filter(Boolean);
  const criterionSet = new Set(criteria);
  const criterionRefs = allTasks.flatMap((task) => task.criterionTexts ?? []).map((criterion) => criterion.trim()).filter(Boolean);
  const invalidCriteria = criterionRefs.filter((criterion) => !criterionSet.has(criterion));
  const unlinkedCriteria = criteria.filter((criterion) => !allTasks.some((task) => (task.criterionTexts ?? []).some((ref) => ref.trim() === criterion)));
  const tasksWithoutCriteria = allTasks.filter((task) => !(task.criterionTexts ?? []).some((criterion) => criterionSet.has(criterion.trim())));
  push(
    "task-criteria",
    language === "kz" ? "Тапсырмалар мен бағалау критерийлері" : "Связь заданий с критериями",
    invalidCriteria.length > 0 ? "fail" : allTasks.length > 0 && criterionSet.size > 0 && unlinkedCriteria.length === 0 && tasksWithoutCriteria.length === 0 ? "ok" : "warn",
    invalidCriteria.length > 0
      ? (language === "kz" ? "Тапсырмада жоспардағы жоқ критерийге сілтеме бар. Сілтемені жаңартыңыз." : "Задание ссылается на критерий, которого уже нет в плане. Обновите связь.")
      : !criterionSet.size
        ? (language === "kz" ? "Алдымен өлшенетін бағалау критерийлерін қосыңыз." : "Добавьте измеримые критерии на вкладке «Цели».")
        : allTasks.length === 0 || unlinkedCriteria.length > 0 || tasksWithoutCriteria.length > 0
          ? (language === "kz" ? "Әр тапсырмаға қолданылатын критерийлерді таңдаңыз; қолданылмаған критерийлерді де тексеріңіз." : "Свяжите задания с критериями; проверьте также критерии, не используемые ни в одном задании.")
          : (language === "kz" ? "Тапсырмалар қолданыстағы бағалау критерийлерімен байланыстырылған." : "Задания связаны с действующими критериями плана."),
    language === "kz" ? "Мақсаттар және сабақ барысы → тапсырмалар" : "Вкладка «Ход урока» → настройки задания",
  );
  const points = allTasks.reduce((s, t) => s + (Number(t.points) || 0), 0);
  const targetPoints = content.qualityTargets?.taskPoints ?? 10;
  push(
    "points",
    "Сумма баллов заданий",
    allTasks.length === 0 ? "warn" : points === targetPoints ? "ok" : "warn",
    allTasks.length === 0
      ? "Практических заданий нет — добавьте хотя бы одно"
      : points === targetPoints
        ? `Заданий: ${allTasks.length}, сумма ${points} совпадает с выбранным ориентиром; это не норматив.`
        : `Сейчас сумма ${points}; выбранный ориентир — ${targetPoints}. Проверьте шкалу относительно целей и критериев; это не нормативный порог.`,
    "Вкладка «Ход урока» → задания",
  );

  // Время — ориентир для планирования, а не официальный норматив.
  const ranges = stages.map(({ key }) => parseTimeRange(content.stages[key]?.time));
  const intervals = ranges.filter((range): range is TimeRange => range !== null);
  const total = intervals.reduce((sum, range) => sum + range.duration, 0);
  const targetDuration = content.qualityTargets?.durationMinutes ?? 45;
  push(
    "time",
    "Хронометраж урока",
    intervals.length < 3 ? "warn" : total === targetDuration ? "ok" : "warn",
    intervals.length < 3
      ? "Укажите время каждого этапа («0–10 мин»)"
      : `Сумма этапов: ${total} мин; выбранный ориентир — ${targetDuration} мин. Это подсказка, а не официальный норматив.`,
    "Вкладка «Ход урока»",
  );
  const hasScheduleIssue = intervals.length < 3 || intervals.slice(0, -1).some((range, index) => {
    const next = intervals[index + 1];
    return !next || range.end > next.start || next.start - range.end > 5;
  });
  push(
    "timeline-continuity",
    language === "kz" ? "Кезеңдердің уақыт байланысы" : "Стыки времени между этапами",
    hasScheduleIssue ? "warn" : "ok",
    hasScheduleIssue
      ? (language === "kz" ? "Қабаттасатын немесе ұзақ үзілісі бар аралықтарды тексеріңіз; мұғалім нақты сабақ кестесін өзі бағалайды." : "Проверьте пересечения и большие промежутки; фактическое расписание оценивает учитель.")
      : (language === "kz" ? "Кезеңдердің уақыт аралықтары ретімен берілген." : "Временные интервалы этапов идут по порядку."),
    language === "kz" ? "Сабақ барысы → уақыт" : "Вкладка «Ход урока» → время этапов",
  );
  const overloadedStages = stages.flatMap(({ key, name }, index) => {
    const taskCount = content.stages[key]?.tasks?.length ?? 0;
    const duration = ranges[index]?.duration;
    return taskCount > 4 || (taskCount > 0 && duration !== undefined && duration < taskCount * 2) ? [name] : [];
  });
  push(
    "stage-load",
    language === "kz" ? "Кезең жүктемесі" : "Нагрузка этапов",
    overloadedStages.length ? "warn" : "ok",
    overloadedStages.length
      ? (language === "kz" ? `Уақытына қатысты тапсырма көп болуы мүмкін: ${overloadedStages.join(", ")}. Мұғалім нақты сабақ жағдайына сай тексереді.` : `Проверьте число заданий и доступное время: ${overloadedStages.join(", ")}. Это ориентир, а не автоматическая оценка выполнимости.`)
      : (language === "kz" ? "Кезең жүктемесі тапсырма саны бойынша айқын тәуекел тудырмайды." : "По числу заданий явных рисков нагрузки не найдено; оцените темп своего класса."),
    language === "kz" ? "Сабақ барысы → тапсырмалар" : "Вкладка «Ход урока» → задания",
  );

  // Финал урока
  const end = content.stages.end;
  push(
    "homework",
    "Домашка с комментарием",
    nonEmpty(end?.homework) ? "ok" : "fail",
    nonEmpty(end?.homework) ? "Задано" : "Без домашки план выглядит незавершённым",
    "Вкладка «Ход урока» → конец",
  );
  push(
    "reflection",
    "Рефлексия учеников",
    (end?.reflectionQuestions?.length ?? 0) > 0 ? "ok" : "warn",
    "3 открытых вопроса: легко / сложно / понравилось",
    "Вкладка «Ход урока» → конец",
  );

  // Оценивание и ценности
  const ev = content.evaluation;
  const evFilled = [ev?.formativeAssessment, ev?.differentiation, ev?.healthAndSafety, ev?.reflection].filter(nonEmpty).length;
  push(
    "evaluation",
    "Оценивание, дифференциация, ТБ",
    evFilled === 4 ? "ok" : evFilled >= 2 ? "warn" : "fail",
    evFilled === 4 ? "Все блоки заполнены" : "Заполните ФО, дифференциацию, ТБ и самоанализ",
    "Вкладка «Оценивание»",
  );

  // Content checks catch generic filler and Russian leakage in Kazakh plans.
  const generatedText = [
    ...content.lessonObjectives,
    ...content.assessmentCriteria,
    ...content.languageObjectives.terms,
    ...content.languageObjectives.phrases,
    content.values, content.crossCurricularLinks, content.priorKnowledge,
    ...stages.flatMap(({ key }) => {
      const stage = content.stages[key];
      return [stage.teacherActions, stage.studentActions, stage.resources, stage.homework ?? "", stage.summary ?? "", ...(stage.keyQuestions ?? []), ...(stage.descriptors ?? []), ...(stage.tasks ?? []).flatMap((task) => [task.question, task.hint ?? "", ...(task.type === "MCQ" ? task.options : []), ...(task.type === "MATCHING" ? [...task.left, ...task.right] : [])])];
    }),
    ev?.formativeAssessment ?? "", ev?.differentiation ?? "", ev?.healthAndSafety ?? "", ev?.reflection ?? "",
  ].join(" ").toLowerCase();
  const genericPhrases = language === "kz"
    ? ["негізгі ұғымдарды меңгереді", "тақырып бойынша тапсырмаларды орындайды", "сабақ тақырыбын түсінеді", "оқушылар тапсырманы орындайды"]
    : ["основные понятия темы", "выполняют задания по теме", "понимают тему урока", "учащиеся выполняют задания"];
  const genericHits = genericPhrases.filter((phrase) => generatedText.includes(phrase));
  push(
    "content-specificity",
    language === "kz" ? "Нақтылық және пәндік мазмұн" : "Конкретность содержания",
    genericHits.length ? "warn" : "ok",
    genericHits.length
      ? (language === "kz" ? "Жалпы сөздерді нақты терминдермен, мысалдармен және тексерілетін әрекеттермен алмастырыңыз." : "Замените общие фразы на конкретные термины, примеры и проверяемые действия.")
      : (language === "kz" ? "Жалпы толтырғыш тіркестер табылған жоқ." : "Типовые фразы-заполнители не найдены."),
    language === "kz" ? "Мақсаттар және сабақ барысы" : "Вкладки «Цели» и «Ход урока»",
  );
  if (language === "kz") {
    const russianTokens = generatedText.match(/(?<![\p{L}\p{N}_])(?:учащиеся|ученики|педагог|задание|урок|выполняют|объясняют|ответы|домашнее|оценивание|критерии)(?![\p{L}\p{N}_])/gu) ?? [];
    push(
      "content-language",
      "Қазақ тілінің бірізділігі",
      russianTokens.length >= 3 ? "warn" : "ok",
      russianTokens.length >= 3 ? "Орыс тілінде қалған нұсқауларды қазақшаға аударыңыз." : "Мәтінде қазақ тілінен ауытқу көп байқалмайды.",
      "Барлық бөлімді тексеріңіз",
    );
  }
  push(
    "values",
    "Ценности и связи",
    nonEmpty(content.values) ? "ok" : "warn",
    "«Адал азамат» и межпредметные связи смотрят на проверке",
    "Вкладка «Контекст»",
  );

  const score = Math.round((items.filter((i) => i.status === "ok").length / items.length) * 100);
  return { items, score };
}

interface TimeRange {
  start: number;
  end: number;
  duration: number;
}

/** "0–10 мин" / "11-35 мин" → интервал; иначе null. */
function parseTimeRange(time: unknown): TimeRange | null {
  if (typeof time !== "string") return null;
  const m = time.replace(",", ".").match(/(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const start = Number(m[1]);
  const end = Number(m[2]);
  const duration = end - start;
  return Number.isFinite(duration) && duration > 0 && duration <= 120 ? { start, end, duration } : null;
}
