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
    content.assessmentCriteria.length >= 3 ? "ok" : content.assessmentCriteria.length > 0 ? "warn" : "fail",
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
  push(
    "task-objectives",
    language === "kz" ? "Тапсырмалардың оқу мақсаттарымен байланысы" : "Связь заданий с целями обучения",
    invalidLinks.length ? "fail" : allTasks.length === 0 || objectives.length === 0 || linkedTasks.length === allTasks.length ? "ok" : "warn",
    invalidLinks.length
      ? (language === "kz" ? "Оқу бағдарламасында жоқ мақсат коды көрсетілген." : "Указан код цели, которого нет среди целей программы.")
      : allTasks.length === 0 || objectives.length === 0 || linkedTasks.length === allTasks.length
        ? (language === "kz" ? "Әр тапсырманың мақсаты дұрыс көрсетілген." : "Для заданий указаны подходящие цели обучения.")
        : (language === "kz" ? "Тапсырмаларды нақты оқу мақсаттарына байланыстырыңыз." : "Привяжите задания к конкретным целям обучения."),
    language === "kz" ? "Сабақ барысы → тапсырмалар" : "Вкладка «Ход урока» → задания",
  );
  const points = allTasks.reduce((s, t) => s + (Number(t.points) || 0), 0);
  push(
    "points",
    "Шкала практики — ровно 10 баллов",
    allTasks.length === 0 ? "warn" : points === 10 ? "ok" : "fail",
    allTasks.length === 0
      ? "Практических заданий нет — добавьте хотя бы одно"
      : points === 10
        ? `Заданий: ${allTasks.length}, сумма ${points}`
        : `Сейчас сумма ${points} — должно быть ровно 10`,
    "Вкладка «Ход урока» → задания",
  );

  // Время: ~45 минут
  const minutes = stages
    .map(({ key }) => parseTimeRange(content.stages[key]?.time))
    .filter((v): v is number => v !== null);
  const total = minutes.reduce((s, v) => s + v, 0);
  push(
    "time",
    "Хронометраж — 45 минут",
    minutes.length < 3 ? "warn" : total === 45 ? "ok" : total >= 40 && total <= 50 ? "warn" : "fail",
    minutes.length < 3
      ? "Укажите время каждого этапа («0–10 мин»)"
      : `Сумма этапов: ${total} мин`,
    "Вкладка «Ход урока»",
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

/** "0–10 мин" / "11-35 мин" → длительность; иначе null. */
function parseTimeRange(time: unknown): number | null {
  if (typeof time !== "string") return null;
  const m = time.replace(",", ".").match(/(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const diff = Number(m[2]) - Number(m[1]);
  return Number.isFinite(diff) && diff > 0 && diff <= 120 ? Math.round(diff) : null;
}
