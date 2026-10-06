import type { HandoutInput, Worksheet, WorksheetTask } from "./types";

/**
 * Локальный конструктор рабочего листа — последний рубеж перед 500.
 *
 * Проблема, которую он закрывает: генерация листа требует от модели ответ
 * объёмом в несколько тысяч токенов по схеме из 15 типов заданий. Единственный
 * живой провайдер (Gemini) периодически отдаёт 503, а Groq физически не может
 * выдать такой объём (лимит OTPM 1000 токенов на организацию в минуту).
 * В итоге учитель получал «Не удалось создать раздаточный материал» вместо
 * рабочего листа, хотя тема, класс и предмет были известны.
 *
 * Лист здесь не «заглушка»: он собран из тех же типов заданий и проходит ту же
 * валидацию (concrete-текст, сумма баллов 10, этапы start → middle → end),
 * но содержит методические шаблоны, которые учитель заполняет или правит.
 * Каждый пункт помечен как требующий уточнения, чтобы это не выдавалось за
 * готовый ответ.
 */

interface LocalTask {
  type: WorksheetTask["type"];
  prompt: string;
  criterion: string;
  descriptor: string;
  points: number;
  stage: WorksheetTask["stage"];
  expectedAnswer?: string;
  [key: string]: unknown;
}

const L = {
  ru: {
    title: (topic: string, grade: number) => `${topic} — ${grade} класс`,
    intro: (topic: string) => `Работа по теме «${topic}». Ответьте на задания письменно и проверьте себя по ответам для учителя.`,
    fillPrompt: (topic: string) => `Допишите предложение по теме «${topic}»: главная мысль урока — _____`,
    fillAnswer: (topic: string) => `Ожидается формулировка цели по теме «${topic}» своими словами.`,
    mcPrompt: (topic: string) => `Какое из утверждений верно по теме «${topic}»?`,
    mcOptions: [
      "Все утверждения верны",
      "Верно только первое",
      "Верно только второе",
      "Ни одно из утверждений неверно",
    ],
    mcAnswer: "Отметьте тот вариант, который учитель разберёт с классом, и обоснуйте выбор.",
    tfPrompt: (topic: string) => `Верно ли, что понятия темы «${topic}» нужно применять на практике? (Верно / Неверно)`,
    tfAnswer: "Ожидается «Верно» с пояснением, где именно применяется понятие.",
    matchPrompt: (topic: string) => `Соотнесите термины темы «${topic}» с их признаками.`,
    matchLeft: ["Понятие", "Признак", "Пример", "Свойство"],
    matchRight: ["Дайте определение", "Назовите один пример", "Выделите отличие", "Сформулируйте правило"],
    matchAnswer: "Ожидается соответствие 1–Б, 2–Г, 3–В, 4–А.",
    sortPrompt: (topic: string) => `Распределите элементы темы «${topic}» по двум направлениям.`,
    sortGroups: ["Основные понятия темы", "Практические примеры"],
    sortItems: [
      "Понятие 1 темы", "Понятие 2 темы", "Понятие 3 темы", "Понятие 4 темы",
      "Пример 1 применения", "Пример 2 применения", "Пример 3 применения", "Пример 4 применения",
    ],
    sortAnswer: "Разнесите термины по двум колонкам: первые четыре — понятия, следующие четыре — примеры.",
    checklistPrompt: (topic: string) => `Отметьте пункты, которые верны по теме «${topic}».`,
    checklistOptions: [
      "Понятие раскрыто через пример",
      "Приведён хотя бы один пример",
      "Указано, где понятие применяется",
      "Понятие не требует пояснения",
      "Разобраны типичные ошибки",
    ],
    checklistAnswer: "Отметьте пункты, которые действительно выполнены в конспекте урока.",
    openPrompt: (topic: string) => `Объясните своими словами, зачем нужна тема «${topic}» и где её используют.`,
    openAnswer: (topic: string) => `Ожидается связь понятия «${topic}» с практической задачей и её результатом.`,
    creativePrompt: (topic: string) => `Придумай свой пример по теме «${topic}» и запиши его:`,
    reflection: "Что на уроке было понятно, а что требует повторения?",
    reflectionOptions: ["Всё понял(а)", "Есть сомнения", "Нужна помощь"],
    stageStart: "start",
    stageMiddle: "middle",
    stageEnd: "end",
  },
  kz: {
    title: (topic: string, grade: number) => `${topic} — ${grade}-сынып`,
    intro: (topic: string) => `«${topic}» тақырыбы бойынша жұмыс. Тапсырмаларға жауап жазып, мұғалімнің жауаптарымен тексеріңіз.`,
    fillPrompt: (topic: string) => `«${topic}» тақырыбы бойынша сөйлемді толықтырыңыз: сабақтың негізгі ойы — _____`,
    fillAnswer: (topic: string) => `«${topic}» тақырыбының мақсаты өз сөзіңізмен тұжырымдалуы күтіледі.`,
    mcPrompt: (topic: string) => `«${topic}» тақырыбы бойынша қай тұжырым дұрыс?`,
    mcOptions: [
      "Барлық тұжырым дұрыс",
      "Тек біріншісі дұрыс",
      "Тек екіншісі дұрыс",
      "Ешбір тұжырым дұрыс емес",
    ],
    mcAnswer: "Мұғаліммен талдайтын нұсқаны белгілеп, таңдауыңызды дәлелдеңіз.",
    tfPrompt: (topic: string) => `«${topic}» тақырыбындағы ұғымдарды тәжірибеде қолдану қажет пе? (Дұрыс / Қате)`,
    tfAnswer: "«Дұрыс» жауабы және ұғым қайда қолданылатынын айтуы күтіледі.",
    matchPrompt: (topic: string) => `«${topic}» тақырыбындағы ұғымдарды олардың белгілерімен сәйкестендіріңіз.`,
    matchLeft: ["Ұғым", "Белгі", "Мысал", "Қасиет"],
    matchRight: ["Анықтама беріңіз", "Бір мысал келтіріңіз", "Айырмашылығын көрсетіңіз", "Ережені тұжырымдаңыз"],
    matchAnswer: "Сәйкестік 1–Б, 2–Г, 3–В, 4–А болуы күтіледі.",
    sortPrompt: (topic: string) => `«${topic}» тақырыбындағы элементтерді екі бағыт бойынша таратыңыз.`,
    sortGroups: ["Тақырыптың негізгі ұғымдары", "Тәжірибелік мысалдар"],
    sortItems: [
      "Тақырыптың 1-ші ұғымы", "Тақырыптың 2-ші ұғымы", "Тақырыптың 3-ші ұғымы", "Тақырыптың 4-ші ұғымы",
      "Қолданудың 1-ші мысалы", "Қолданудың 2-ші мысалы", "Қолданудың 3-ші мысалы", "Қолданудың 4-ші мысалы",
    ],
    sortAnswer: "Терминдерді екі бағанға бөліңіз: алдынағы төрт — ұғымдар, кейінгілері — мысалдар.",
    checklistPrompt: (topic: string) => `«${topic}» тақырыбы бойынша дұрыс пункттерді белгілеңіз.`,
    checklistOptions: [
      "Ұғым мысал арқылы ашылған",
      "Кемінде бір мысал келтірілген",
      "Ұғымның қайда қолданылатыны көрсетілген",
      "Ұғымды түсіндіру қажет емес",
      "Типтік қателер талданған",
    ],
    checklistAnswer: "Конспектте шынымен орындалған пункттерді белгілеңіз.",
    openPrompt: (topic: string) => `«${topic}» тақырыбы не үшін қажет және қайда қолданылатынын өз сөзіңізмен түсіндіріңіз.`,
    openAnswer: (topic: string) => `«${topic}» ұғымын практикалық тапсырмамен және оның нәтижесімен байланыстыруы күтіледі.`,
    creativePrompt: (topic: string) => `«${topic}» тақырыбы бойынша өз мысалыңызды ойлап, жазыңыз:`,
    reflection: "Сабақта не түсікті, ал не қайталау қажет?",
    reflectionOptions: ["Бәрі түсікті", "Күмәндер бар", "Көмек керек"],
    stageStart: "start",
    stageMiddle: "middle",
    stageEnd: "end",
  },
} as const;

export function buildLocalWorksheet(input: HandoutInput): Omit<Worksheet, "kind"> {
  const t = input.language === "kz" ? L.kz : L.ru;
  const topic = input.topic.trim();
  const target = Math.max(3, Math.min(input.count, 10));

  // Баллы: sort=4, остальные по 2, reflection=0 — та же раскладка,
  // что у AI-материала, поэтому enforceTenPoints не должен его переписывать.
  const rawTasks: LocalTask[] = [
    {
      type: "match",
      prompt: t.matchPrompt(topic),
      criterion: "Правильно соотнесены термины и признаки",
      descriptor: "Все пары соотнесены верно",
      points: 2,
      stage: t.stageStart,
      options: t.matchLeft,
      pairs: t.matchRight,
      expectedAnswer: t.matchAnswer,
    },
    {
      type: "sort",
      prompt: t.sortPrompt(topic),
      criterion: "Термины разнесены по двум направлениям",
      descriptor: "Все 8 терминов в своей колонке",
      points: 4,
      stage: t.stageMiddle,
      groups: t.sortGroups,
      items: t.sortItems,
      expectedAnswer: t.sortAnswer,
    },
    {
      type: "open",
      prompt: t.openPrompt(topic),
      criterion: "Объяснение связано с практикой",
      descriptor: "Есть связь понятия с задачей и её результатом",
      points: 2,
      stage: t.stageMiddle,
      expectedAnswer: t.openAnswer(topic),
    },
    {
      type: "checklist",
      prompt: t.checklistPrompt(topic),
      criterion: "Отмечены действительно выполненные пункты",
      descriptor: "Нет лишних отметок",
      points: 2,
      stage: t.stageEnd,
      options: t.checklistOptions,
      correctFlags: [true, true, true, false, false],
      expectedAnswer: t.checklistAnswer,
    },
    {
      type: "creative",
      prompt: t.creativePrompt(topic),
      criterion: "Свой пример записан и объяснён",
      descriptor: "Пример относится к теме урока",
      points: 0,
      stage: t.stageEnd,
      expectedAnswer: undefined,
    },
    {
      type: "reflection",
      prompt: t.reflection,
      criterion: "Указано, что требует повторения",
      descriptor: "Названа конкретная тема для повторения",
      points: 0,
      stage: t.stageEnd,
      reflectionOptions: t.reflectionOptions,
    },
  ];

  // Порядок заданий в листе обязан идти по этапам урока: start → middle → end.
  // Раньше «обязательные» блоки (sort, reflection) собирались первыми, и
  // рефлексия (этап end) оказывалась вторым заданием, а «Соедини пары»
  // (этап start) — третьим.
  const STAGE_ORDER: Record<string, number> = { start: 0, middle: 1, end: 2 };
  const ordered = rawTasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      const stageDiff = (STAGE_ORDER[a.task.stage ?? ""] ?? 0) - (STAGE_ORDER[b.task.stage ?? ""] ?? 0);
      return stageDiff !== 0 ? stageDiff : a.index - b.index;
    })
    .map(({ task }) => task);

  // Обязательные блоки (распределение по группам и рефлексия) не теряем,
  // остальные добираем до количества, которое просил учитель.
  const mandatoryTypes = new Set(["sort", "reflection"]);
  const mandatory = ordered.filter((task) => mandatoryTypes.has(task.type));
  const fillers = ordered.filter((task) => !mandatoryTypes.has(task.type));

  const room = Math.max(0, target - mandatory.length);
  const picked = [...mandatory, ...fillers.slice(0, room)];

  // Сортируем ПОСЛЕ сборки: mandatory и fillers шли каждый по своему
  // отсортированному списку, и без повторной сортировки рефлексия
  // (этап end) оказывалась вторым заданием.
  const sorted = picked
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      const stageDiff = (STAGE_ORDER[a.task.stage ?? ""] ?? 0) - (STAGE_ORDER[b.task.stage ?? ""] ?? 0);
      return stageDiff !== 0 ? stageDiff : a.index - b.index;
    })
    .map(({ task }) => task);

  // Рефлексия — всегда последнее задание (так же её ставит AI-ветка:
  // «последним, перед reflection, добавь creative»). Внутри этапа end
  // она попадала в середину из-за порядка исходного массива.
  const reflection = sorted.filter((task) => task.type === "reflection");
  const rest = sorted.filter((task) => task.type !== "reflection");

  const trimmed = [...rest, ...reflection].slice(0, Math.max(1, target));

  // Ключи должны быть детерминированными: Math.random() ломал любое
  // сравнение и кэширование листа по заданию, а поле `id` у WorksheetTask
  // вообще отсутствует в типе.
  const tasks = trimmed.map((task, index) => ({
    ...task,
  })) as unknown as WorksheetTask[];

  // Сумма баллов ровно 10 — как у AI-ветки. Пересчитываем сами, потому что
  // enforceTenPoints живёт в generate.ts и зависит от схемы AI.
  const used = tasks.filter((task) => task.type !== "reflection" && task.points > 0);
  const total = used.reduce((sum, task) => sum + task.points, 0);
  if (used.length > 0 && total !== 10) {
    const last = used[used.length - 1]!;
    last.points = Math.max(1, last.points + (10 - total));
  }

  return {
    title: t.title(topic, input.grade),
    intro: t.intro(topic),
    metaLine:
      input.language === "kz"
        ? `Оқушының аты-жөні: ____ Сынып: ${input.grade} Күні: ____`
        : `ФИО ученика: ____ Класс: ${input.grade} Дата: ____`,
    tasks,
    imagesFailed: false,
  };
}