import type { KspContent } from "@/lib/types/ksp";

/**
 * Проверка готовности КСП к уроку и печати: цели → задания → баллы →
 * дескрипторы → время → рефлексия. Каждый пункт — ok/warn/fail.
 * Профильные проверки учитывают выбранный schoolProfile и учительские
 * ориентиры qualityTargets (длительность/баллы — не норматив).
 */

export type QualityStatus = "ok" | "warn" | "fail";

export type EditorTab = "meta" | "goals" | "context" | "flow" | "evaluation";

export interface QualityItem {
  id: string;
  label: string;
  status: QualityStatus;
  hint: string;
  /** Человекочитаемая подсказка, где исправить. */
  where: string;
  /** Технический таб редактора для перехода. */
  whereTab: EditorTab;
  /** Якорь поля внутри таба (id элемента или hash). */
  whereAnchor?: string;
  /** Раскрываемое пояснение — как исправить и почему. */
  details?: string;
  /** Помечает эвристику как не-норматив (показывает disclaimer). */
  nonNormative?: boolean;
}

const nonEmpty = (v: unknown): boolean =>
  Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim().length > 0 : v != null;

type LocalizedStrings = {
  hint: string;
  details: string;
  where: string;
};

function profileLabel(profile: string | undefined, language: "ru" | "kz"): string | null {
  if (profile === "emn") return language === "kz" ? "ЖМБ" : "ЕМН";
  if (profile === "ogn") return language === "kz" ? "ҚГБ" : "ОГН";
  return null;
}

export function checkKspQuality(content: KspContent, language: "ru" | "kz" = "ru"): { items: QualityItem[]; score: number } {
  const items: QualityItem[] = [];
  const push = (
    id: string,
    label: string,
    status: QualityStatus,
    hint: string,
    where: string,
    whereTab: EditorTab,
    opts?: { anchor?: string; details?: string; nonNormative?: boolean },
  ) => {
    items.push({ id, label, status, hint, where, whereTab, whereAnchor: opts?.anchor, details: opts?.details, nonNormative: opts?.nonNormative });
  };

  const profile = content.schoolProfile;
  const profLabel = profileLabel(profile, language);

  // Цели и критерии
  const objectives = content.learningObjectives ?? [];
  push(
    "objectives",
    "Цели обучения из ТУП",
    objectives.length > 0 ? "ok" : "fail",
    objectives.length > 0 ? `Выбрано: ${objectives.length}` : "Без целей из программы план не примут на проверку",
    "Вкладка «Цели» → коды ТУП",
    "goals",
    {
      anchor: "learningObjectives",
      details:
        language === "kz"
          ? "Әр оқу мақсаты — ГОСО коды мен тұжырымы. ТУП-тан таңдап, тапсырмаларға байланыстырыңыз; бос қалдырсаңыз, жоспар мектеп тексерісінен өтпейді."
          : "Каждый код цели — строка из ТУП ГОСО. Выберите коды в редакторе целей и свяжите с заданиями. Без них план не пройдёт школьную проверку, а ИИ не разметит задания.",
    },
  );
  push(
    "lesson-objectives",
    "SMART-цели урока",
    content.lessonObjectives.length >= 3 ? "ok" : content.lessonObjectives.length > 0 ? "warn" : "fail",
    content.lessonObjectives.length >= 3 ? `Целей: ${content.lessonObjectives.length}` : "Нужно 3–5 целей «Учащиеся смогут …»",
    "Вкладка «Цели» → цели урока",
    "goals",
    {
      anchor: "lessonObjectives",
      details:
        language === "kz"
          ? "SMART: нақты, өлшенетін, қол жетімді, маңызды, мерзімді. Кемінде 3 мақсат жазыңыз — олар критерийлер мен тапсырмаларға негіз болады."
          : "SMART-цели — конкретные и проверяемые действия ученика. Нужно 3–5 штук: от них зависят критерии и задания.",
    },
  );
  push(
    "criteria",
    "Измеримые критерии",
    content.assessmentCriteria.filter((criterion) => nonEmpty(criterion)).length >= 3 ? "ok" : content.assessmentCriteria.some((criterion) => nonEmpty(criterion)) ? "warn" : "fail",
    "Каждый критерий — наблюдаемое действие",
    "Вкладка «Цели» → критерии оценивания",
    "goals",
    {
      anchor: "assessmentCriteria",
      details:
        language === "kz"
          ? "Әр критерий — оқушының бақыланатын әрекеті («Теңдеуді шешеді», «Мысал келтіреді»). Жалпы сөздерден («тақырыпты түсінеді») аулақ болыңыз."
          : "Каждый критерий — наблюдаемое действие ученика («Решает уравнение», «Приводит пример»). Общие фразы («понимают тему») замените на проверяемые.",
    },
  );

  // Этапы
  const stages = [
    { key: "beginning" as const, name: "Начало", tabAnchor: "stage-beginning" },
    { key: "middle" as const, name: "Середина", tabAnchor: "stage-middle" },
    { key: "end" as const, name: "Конец", tabAnchor: "stage-end" },
  ];
  for (const { key, name, tabAnchor } of stages) {
    const st = content.stages[key];
    if (!st) {
      push(`stage-${key}`, `${name} урока`, "fail", "Этап отсутствует", "Вкладка «Ход урока» → " + name, "flow", {
        anchor: tabAnchor,
        details: language === "kz" ? "Кезең деректері жоқ — редакторда «Ход урока» бөлімін толтырыңыз." : "Данные этапа отсутствуют — заполните секцию «Ход урока» в редакторе.",
      });
      continue;
    }
    const filled = [st.teacherActions, st.studentActions, st.resources].filter(nonEmpty).length;
    const hasTime = nonEmpty(st.time);
    push(
      `stage-${key}`,
      `${name} урока: сценарий`,
      filled === 3 && hasTime ? "ok" : filled > 0 || hasTime ? "warn" : "fail",
      filled === 3 && hasTime
        ? "Слова педагога, действия учеников, ресурсы и время на месте"
        : !hasTime
          ? "Укажите время этапа («0–10 мин») и допишите действия и ресурсы"
          : "Допишите действия и ресурсы",
      `Вкладка «Ход урока» → ${name} → время/сценарий`,
      "flow",
      {
        anchor: tabAnchor,
        details:
          language === "kz"
            ? `«${name}» кезеңінде мұғалім сөзі, оқушы әрекеті, ресурстар және уақыт аралығы толтырылуы керек. Біреуі бос болса — сабақ жоспары толық емес.`
            : `Этап «${name}» требует 4 поля: слова педагога, действия учеников, ресурсы и время («0–10 мин»). Пустое поле — план считается незаполненным.`,
      },
    );
    push(
      `stage-${key}-questions`,
      `${name}: вопросы и дескрипторы`,
      (st.keyQuestions ?? []).length > 0 && (st.descriptors ?? []).length > 0 ? "ok" : "warn",
      "К вопросам и дескрипторам вернутся на проверке",
      `Вкладка «Ход урока» → ${name} → вопросы/дескрипторы`,
      "flow",
      {
        anchor: `${tabAnchor}-questions`,
        details:
          language === "kz"
            ? "Әр кезеңге 2–3 ашық сұрақ және 2–3 дескриптор (бағалау үшін тексерілетін әрекет) қосыңыз. Олар сабақтағы диалогты және ФО-ны қамтамасыз етеді."
            : "На каждый этап добавьте 2–3 ключевых вопроса и 2–3 дескриптора — проверяемые шаги ученика. Без них беседа и ФО остаются формальными.",
      },
    );
  }

  // Связи цели ↔ задания, критерии ↔ задания
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
    "flow",
    {
      anchor: "stage-middle-tasks",
      details:
        language === "kz"
          ? invalidLinks.length
            ? `Қате сілтемелер: ${invalidLinks.map((t) => t.objectiveCode).join(", ")}. Тапсырма баптауында қолданыстағы мақсат кодын таңдаңыз.`
            : "Әр тапсырмада «Оқу мақсаты» өрісін толтырыңыз — жоспарда жарияланған кодтардан таңдаңыз. Бос байланыс — мақсат тексерілмейді."
          : invalidLinks.length
            ? `Битые ссылки: ${invalidLinks.map((t) => t.objectiveCode).join(", ")}. В настройках задания выберите код из списка целей плана.`
            : "В каждом задании заполните поле «Цель обучения» — выберите код из заявленных целей плана. Пустая связь означает, что цель не проверяется заданием.",
      nonNormative: false,
    },
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
    "flow",
    {
      anchor: "stage-middle-tasks",
      details:
        language === "kz"
          ? unlinkedObjectives.length > 0
            ? `Қамтылмаған мақсаттар: ${unlinkedObjectives.map((o) => o.code).join(", ")}. Оларға арналған тапсырма қосыңыз немесе мақсатты өшіріңіз.`
            : "Барлық жарияланған мақсаттар кемінде бір тапсырмада қолданылады — сабақ жоспары мақсаттарды толық жабады."
          : unlinkedObjectives.length > 0
            ? `Не покрыты: ${unlinkedObjectives.map((o) => o.code).join(", ")}. Добавьте задания под эти цели или уберите лишнюю цель.`
            : "Все заявленные цели имеют хотя бы одно задание — иначе цель остаётся на бумаге без проверки.",
    },
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
    "flow",
    {
      anchor: "task-criteria",
      details:
        language === "kz"
          ? invalidCriteria.length > 0
            ? `Ескірген сілтемелер: ${invalidCriteria.slice(0, 3).join(" | ")}. Тапсырма баптауында критерийді қайта таңдаңыз.`
            : unlinkedCriteria.length > 0
              ? `Қолданылмаған критерийлер: ${unlinkedCriteria.slice(0, 3).join(" | ")}. Оларды тапсырмаларға байлаңыз немесе өшіріңіз.`
              : tasksWithoutCriteria.length > 0
                ? `${tasksWithoutCriteria.length} тапсырмада критерий таңдалмаған. Әр тапсырманы кемінде бір критериймен байланыстырыңыз.`
                : "Барлық критерийлер кемінде бір тапсырмада қолданылады, әр тапсырманың критерийі бар."
          : invalidCriteria.length > 0
            ? `Битые ссылки: ${invalidCriteria.slice(0, 3).join(" | ")}. Обновите критерии в настройках задания.`
            : unlinkedCriteria.length > 0
              ? `Не используются ни в одном задании: ${unlinkedCriteria.slice(0, 3).join(" | ")}. Свяжите их с заданиями или удалите.`
              : tasksWithoutCriteria.length > 0
                ? `${tasksWithoutCriteria.length} заданий без критериев. Привяжите каждое задание хотя бы к одному критерию.`
                : "Каждый критерий используется, каждое задание имеет критерий.",
    },
  );
  const points = allTasks.reduce((s, t) => s + (Number(t.points) || 0), 0);
  const targetPoints = content.qualityTargets?.taskPoints ?? 10;
  const pointsProfileSuffix = profLabel ? ` · профиль ${profLabel}` : "";
  push(
    "points",
    "Сумма баллов заданий",
    allTasks.length === 0 ? "warn" : points === targetPoints ? "ok" : "warn",
    allTasks.length === 0
      ? "Практических заданий нет — добавьте хотя бы одно"
      : points === targetPoints
        ? `Заданий: ${allTasks.length}, сумма ${points} совпадает с выбранным ориентиром${pointsProfileSuffix}; это не норматив.`
        : `Сейчас сумма ${points}; выбранный ориентир — ${targetPoints}${pointsProfileSuffix}. Проверьте шкалу относительно целей и критериев; это не нормативный порог.`,
    "Вкладка «Ход урока» → задания → баллы",
    "flow",
    {
      anchor: "quality-points-target",
      details:
        language === "kz"
          ? `Мұғалім таңдаған бағдар — ${targetPoints} ұпай. Нақты шкаланы мақсат/критерийге сай өзіңіз белгілейсіз; жүйе тек сәйкестікті тексереді, ресми норма емес.`
          : `Учительский ориентир — ${targetPoints} баллов (меняется в «Ориентиры планирования» на вкладке «Ход урока»). Система сверяет сумму заданий с ним и подсказывает расхождение; это не официальный норматив.`,
      nonNormative: true,
    },
  );

  // Время — ориентир для планирования, а не официальный норматив. Профильно-зависимый.
  const ranges = stages.map(({ key }) => parseTimeRange(content.stages[key]?.time));
  const intervals = ranges.filter((range): range is TimeRange => range !== null);
  const total = intervals.reduce((sum, range) => sum + range.duration, 0);
  const targetDuration = content.qualityTargets?.durationMinutes ?? 45;
  const durationProfileSuffix = profLabel ? ` · профиль ${profLabel}` : "";
  push(
    "time",
    "Хронометраж урока",
    intervals.length < 3 ? "warn" : total === targetDuration ? "ok" : "warn",
    intervals.length < 3
      ? "Укажите время каждого этапа («0–10 мин»)"
      : `Сумма этапов: ${total} мин; выбранный ориентир — ${targetDuration} мин${durationProfileSuffix}. Это подсказка, а не официальный норматив.`,
    "Вкладка «Ход урока» → время этапов",
    "flow",
    {
      anchor: "quality-duration-target",
      details:
        language === "kz"
          ? `Мұғалім таңдаған бағдар — ${targetDuration} минут. Барлық 3 кезеңнің уақытын «0–10 мин» форматында толтырыңыз; жүйе қосындыны бағдармен салыстырады, ресми норма емес.`
          : `Учительский ориентир — ${targetDuration} мин (меняется в «Ориентиры планирования»). Заполните время всех 3 этапов в формате «0–10 мин»; система сверяет сумму с ориентиром. Это подсказка, а не норматив.`,
      nonNormative: true,
    },
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
    "flow",
    {
      anchor: "quality-duration-target",
      details:
        language === "kz"
          ? "Кезеңдер тізбектеліп, қабаттаспай және 5 минуттан аспайтын үзіліспен жалғасуы керек. Бос немесе қате уақыт — «Уақыт» өрісін «0–10» форматында түзетіңіз."
          : "Этапы должны идти последовательно без наложений и пауз свыше 5 мин. Пустое или неверное время этапа — исправьте поле «Время» в формате «0–10 мин».",
      nonNormative: true,
    },
  );
  const overloadedStages = stages.flatMap(({ key, name }, index) => {
    const taskCount = content.stages[key]?.tasks?.length ?? 0;
    const duration = ranges[index]?.duration;
    // Профильно-зависимый эвристический порог: ЕМН допускает чуть больше задач на этап, ОГН — строже к перегрузке текстом.
    const maxTasks = profile === "emn" ? 5 : profile === "ogn" ? 4 : 4;
    const minutesPerTask = profile === "emn" ? 1.5 : 2;
    return taskCount > maxTasks || (taskCount > 0 && duration !== undefined && duration < taskCount * minutesPerTask) ? [name] : [];
  });
  push(
    "stage-load",
    language === "kz" ? "Кезең жүктемесі" : "Нагрузка этапов",
    overloadedStages.length ? "warn" : "ok",
    overloadedStages.length
      ? (language === "kz" ? `Уақытына қатысты тапсырма көп болуы мүмкін: ${overloadedStages.join(", ")}. Мұғалім нақты сабақ жағдайына сай тексереді.` : `Проверьте число заданий и доступное время: ${overloadedStages.join(", ")}. Это ориентир, а не автоматическая оценка выполнимости.`)
      : (language === "kz" ? "Кезең жүктемесі тапсырма саны бойынша айқын тәуекел тудырмайды." : "По числу заданий явных рисков нагрузки не найдено; оцените темп своего класса."),
    language === "kz" ? "Сабақ барысы → тапсырмалар" : "Вкладка «Ход урока» → задания",
    "flow",
    {
      anchor: "stage-middle-tasks",
      details:
        language === "kz"
          ? `Эвристика: бір кезеңге ${profile === "emn" ? 5 : 4} тапсырмадан артық немесе бір тапсырмаға ${profile === "emn" ? "1,5" : "2"} минуттан аз — шамадан тыс жүк. Нақты орындалуын сынып қарқынына қарап мұғалім шешеді.`
          : `Эвристика: >${profile === "emn" ? 5 : 4} заданий на этап или <${profile === "emn" ? "1,5" : "2"} мин на задание — признак перегрузки. Выполнимость оценивает учитель с учётом темпа класса; это не блокирующая проверка.`,
      nonNormative: true,
    },
  );

  // Финал урока
  const end = content.stages.end;
  push(
    "homework",
    "Домашка с комментарием",
    nonEmpty(end?.homework) ? "ok" : "fail",
    nonEmpty(end?.homework) ? "Задано" : "Без домашки план выглядит незавершённым",
    "Вкладка «Ход урока» → Конец → домашнее задание",
    "flow",
    {
      anchor: "stage-end-homework",
      details:
        language === "kz"
          ? "Үй тапсырмасына қысқа нұсқау мен бағалау критерийін қосыңыз (қай бет, не істеу, қалай тексеріледі)."
          : "К домашке добавьте краткий комментарий: что сделать, где посмотреть, как будет проверено.",
    },
  );
  push(
    "reflection",
    "Рефлексия учеников",
    (end?.reflectionQuestions?.length ?? 0) > 0 ? "ok" : "warn",
    "3 открытых вопроса: легко / сложно / понравилось",
    "Вкладка «Ход урока» → Конец → рефлексия",
    "flow",
    {
      anchor: "stage-end-reflection",
      details:
        language === "kz"
          ? "Соңында оқушыларға 2–3 рефлексия сұрағын қосыңыз: «Не үйрендің? Не қиын болды? Не ұнады?»."
          : "В конце добавьте 2–3 вопроса рефлексии: «Что узнал? Что было трудно? Что понравилось?».",
    },
  );

  // Оценивание и ценности
  const ev = content.evaluation;
  const evFilled = [ev?.formativeAssessment, ev?.differentiation, ev?.healthAndSafety, ev?.reflection].filter(nonEmpty).length;
  push(
    "evaluation",
    "Оценивание, дифференциация, ТБ",
    evFilled === 4 ? "ok" : evFilled >= 2 ? "warn" : "fail",
    evFilled === 4 ? "Все блоки заполнены" : "Заполните ФО, дифференциацию, ТБ и самоанализ",
    "Вкладка «Оценивание» → все поля",
    "evaluation",
    {
      anchor: "formativeAssessment",
      details:
        language === "kz"
          ? "ФО, саралау, қауіпсіздік және мұғалім рефлексиясы — әрқайсысына 1–2 сөйлем жеткілікті. Бос блок — жоспар тексерісте аяқталмаған көрінеді."
          : "ФО, дифференциация, ТБ и рефлексия учителя — по 1–2 предложения на блок. Пустой блок делает план неполным на проверке.",
    },
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
    "goals",
    {
      anchor: "lessonObjectives",
      details:
        language === "kz"
          ? `Табылған толтырғыштар: ${genericHits.join(", ")}. Оларды пән терминімен, мысалмен, өлшенетін әрекетпен ауыстырыңыз.`
          : `Найдены заполнители: ${genericHits.join(", ")}. Замените на термин предмета, пример, проверяемое действие.`,
    },
  );
  if (language === "kz") {
    const russianTokens = generatedText.match(/(?<![\p{L}\p{N}_])(?:учащиеся|ученики|педагог|задание|урок|выполняют|объясняют|ответы|домашнее|оценивание|критерии)(?![\p{L}\p{N}_])/gu) ?? [];
    push(
      "content-language",
      "Қазақ тілінің бірізділігі",
      russianTokens.length >= 3 ? "warn" : "ok",
      russianTokens.length >= 3 ? "Орыс тілінде қалған нұсқауларды қазақшаға аударыңыз." : "Мәтінде қазақ тілінен ауытқу көп байқалмайды.",
      "Барлық бөлімді тексеріңіз",
      "goals",
      {
        anchor: "lessonObjectives",
        details: "Мәтінде 3+ орыс сөзі табылса — қазақшаға аударыңыз. Бірлі-жарым термин қалыпты.",
      },
    );
  }
  push(
    "values",
    "Ценности и связи",
    nonEmpty(content.values) ? "ok" : "warn",
    "«Адал азамат» и межпредметные связи смотрят на проверке",
    "Вкладка «Контекст» → ценности",
    "context",
    {
      anchor: "values",
      details:
        language === "kz"
          ? "Құндылықты сабақ әрекетімен байланыстырыңыз: қай тапсырмада, қалай көрінеді. Жалпы ұран жеткіліксіз."
          : "Свяжите ценность с действием урока: в каком задании и как она проявляется. Общего лозунга недостаточно.",
    },
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
