import OpenAI from "openai";
import { layoutCrossword } from "./crossword";
import { illustrateFlashcards, illustrateWorksheetTasks } from "./images";
import { executeWithFallback, getResponseFormat, isAnyProviderConfigured } from "@/lib/ai/providers";
import { extractJson } from "@/lib/ai/extract-json";
import { HandoutQuotaError } from "@/lib/billing/quota-error";
import { buildLocalCrossword, buildLocalFlashcards } from "./local-flashcards";
import { buildLocalWorksheet } from "./local-worksheet";
import { log } from "@/lib/logger";
import type {
  Crossword,
  CrosswordWord,
  Flashcard,
  FlashcardSet,
  Handout,
  HandoutInput,
  Worksheet,
  WorksheetTask,
  WorksheetTaskType,
} from "./types";

/**
 * Генерация раздаточного материала по теме урока.
 *
 * Использует общий набор текстовых AI-провайдеров. Если они недоступны,
 * применяет локальный конструктор с явной отметкой о необходимости проверки.
 */
export async function generateHandout(input: HandoutInput): Promise<Handout> {
  // Локальная версия остаётся полезной и честно помеченной как degraded.
  // Она не выдаёт шаблон за результат AI и не списывает AI-квоту.
  if (!isAnyProviderConfigured() && !process.env.OPENAI_API_KEY) {
    if (input.kind === "worksheet") {
      const sheet: Worksheet = { kind: "worksheet", language: input.language, ...buildLocalWorksheet(input), degraded: true, learningObjectives: input.kspContext?.learningObjectives };
      // Preserve requested card layout in the local fallback too; image
      // generation stays an independent opt-in feature.
      if (input.cardLayout || input.withImages || input.generateImages) {
        sheet.cardLayout = true;
      }
      if (input.withImages || input.generateImages) {
        const { items, created } = await illustrateWorksheetTasks(sheet.tasks, { topic: input.topic, subject: input.subject, grade: input.grade }, imageSlotReserver(input));
        sheet.tasks = items;
        sheet.imagesFailed = items.some((task) => task.imagePromptEn?.trim()) && created === 0;
      }
      return sheet;
    }
    if (input.kind === "flashcards") {
      const set = buildLocalFlashcards(input);
      if (input.withImages) {
        const { items, created } = await illustrateFlashcards(set.cards, { topic: input.topic, subject: input.subject, grade: input.grade, language: input.language }, imageSlotReserver(input));
        set.cards = items;
        set.imagesFailed = set.cards.length > 0 && created === 0;
      }
      return set;
    }
    const puzzle = buildLocalCrossword(input);
    if (puzzle.grid.length === 0) {
      throw new Error("Не удалось составить кроссворд: добавьте не менее трёх терминов из темы или целей урока.");
    }
    return puzzle;
  }
  // Слот за текстовую генерацию — до обращения к провайдерам.
  const genSlot = input.quota ? await input.quota.reserve("generation") : { ok: true as const };
  if (!genSlot.ok) {
    throw new HandoutQuotaError();
  }
  let keepGenerationSlot = true;
  try {
    const handout = await runGeneration(input);
    await genSlot.finalize?.(true);
    return handout;
  } catch (e) {
    // Не списать слот за неудачную генерацию.
    keepGenerationSlot = false;
    throw e;
  } finally {
    if (!keepGenerationSlot) await genSlot.finalize?.(false).catch(() => {});
  }
}

/** Квота тарифа исчерпана — вызывающий роут превращает в 402/429. */
export { HandoutQuotaError } from "@/lib/billing/quota-error";

async function runGeneration(input: HandoutInput): Promise<Handout> {
  if (input.kind === "worksheet") {
    const sheet = await aiWorksheet(input);
    // Карточный режим без картинок возможен,
    // а картинки — только при явном withImages или generateImages.
    const wantImages = Boolean(input.withImages || input.generateImages);
    const cardLayout = Boolean(input.cardLayout || wantImages);
    if (cardLayout) {
      sheet.cardLayout = true;
    }
    if (wantImages) {
      const { items, created } = await illustrateWorksheetTasks(sheet.tasks, {
        topic: input.topic,
        subject: input.subject,
        grade: input.grade,
      }, imageSlotReserver(input));
      sheet.tasks = items;
      // Пометка ставится только когда провайдер не дал ни одной картинки.
      // Раньше сравнивалось `created < items.length`, где items — ВСЕ задания,
      // а иллюстрируются лишь те, у которых модель выдала imagePromptEn.
      // Если промпты были у 2 заданий из 6 и обе картинки пришли, учитель
      // получал в документе «сервис изображений временно недоступен» при
      // полном успехе — и не доверял материалу зря.
      const illustratable = items.filter((task) => task.imagePromptEn && task.imagePromptEn.trim()).length;
      sheet.imagesFailed = illustratable > 0 && created === 0;
    }
    if (input.cardLayout) {
      sheet.cardLayout = true;
    }
    if (input.kspContext?.learningObjectives) {
      sheet.learningObjectives = input.kspContext.learningObjectives;
    }
    return sheet;
  }
  if (input.kind === "flashcards") {
    const set = await flashcardsWithFallback(input);
    if (input.withImages) {
      const { items, created } = await illustrateFlashcards(set.cards, {
        topic: input.topic,
        subject: input.subject,
        grade: input.grade,
        language: input.language,
      }, imageSlotReserver(input));
      set.cards = items;
      // Для памяток промпт строится из самой карточки, поэтому иллюстрируются
      // все. Пометка ставится, когда провайдер не вернул ни одной картинки —
      // раньше она сравнивала created с числом карточек и срабатывала бы
      // при частичном успехе, а это норма, а не сбой.
      set.imagesFailed = items.length > 0 && created === 0;
    }
    return set;
  }
  return await crosswordWithFallback(input);
}

/** Резерватор слотов квоты изображений для генератора иллюстраций. */
function imageSlotReserver(input: HandoutInput) {
  return async () => {
    if (!input.quota) return { ok: true as const };
    return input.quota.reserve("image");
  };
}

const SYSTEM = `Ты методист РК, готовящий раздаточные материалы по теме урока.
Уровень — соответствующий классу. Вопросы и задания привязаны к теме, без воды. Язык — строго язык, заданный пользователем: все подписи, инструкции, критерии, дескрипторы, варианты ответов, ключи и введение пиши на нём. Не смешивай русский и казахский. Перед выдачей проверь, что каждое задание решается по конкретным знаниям темы и соответствует указанной цели обучения.
Отвечай строго в JSON по схеме, без markdown и без пояснений.`;

async function aiWorksheet(input: HandoutInput): Promise<Worksheet> {
  const lang = input.language === "kz" ? "казахский" : "русский";
  // Эталон рабочего листа РК (см. _refimg image4..image9):
  // баннеры «Задание №N», таблицы с тёмно-синей рамкой и цветной шапкой,
  // персиковое облако-сценарий, кнопки-варианты ответа, блок «Ответы для учителя»,
  // дескрипторы и рефлексия-смайлики в конце.
  let contextBlock = "";
  if (input.kspContext) {
    const { learningObjectives, assessmentCriteria, stages } = input.kspContext;
    contextBlock = `
КОНТЕКСТ УРОКА (обязательно свяжи задания с этим!):
- Цели обучения: ${learningObjectives.join("; ")}
- Критерии оценивания: ${assessmentCriteria.join("; ")}
- Планируемые активности на уроке: 
  * Начало: ${stages.find(s => s.stage === "start")?.activities || "нет"}
  * Середина: ${stages.find(s => s.stage === "middle")?.activities || "нет"}
  * Конец: ${stages.find(s => s.stage === "end")?.activities || "нет"}`;
  }

  const difficultyLabel = input.difficulty === "easy" ? "лёгкий" : input.difficulty === "hard" ? "сложный" : "средний";
  const user = `${input.language === "kz" ? "НАЗАР АУДАР: барлық мәтін табиғи қазақ тілінде болсын. Егер тақырып, пән немесе оқу мақсаты орысша берілсе, оларды мағынасын сақтап қазақшаға аудар. Орысша нұсқауларды, жауаптарды және бағалау атауларын қоспа. JSON өрістерінің атауларын өзгертпе." : ""}\nСоставь рабочий лист (worksheet) на ${lang} по теме «${input.topic}» для ${input.grade} класса (${input.subject}).${contextBlock}

Кол-во заданий: ${input.count}. Используй РАЗНЫЕ типы (не повторяй один тип подряд). Уровень сложности: ${difficultyLabel}.

ЭТАЛОН КАЧЕСТВА (обязательно, как в лучших листах учителей):
1. КОНКРЕТИКА ВМЕСТО АБСТРАКЦИИ. Каждое задание содержит реальные факты темы: термины, определения, числа, имена, даты, примеры. ЗАПРЕЩЕНЫ заглушки вида «Понятие 1», «Описание B», «Тема относится к предмету», «Ключевое понятие — _____» без контекста, повтор названия темы вместо ответа. Ученик должен работать с содержанием, а не с названием темы.
2. ОБЯЗАТЕЛЬНАЯ СТРУКТУРА (при count ≥ 6):
   - Задание 1 — "sort": «Распредели элементы по двум направлениям». groups — 2 ОСМЫСЛЕННЫХ названия направлений по теме (напр. «Защита учётной записи» / «Защита компьютера и данных»), не «Группа 1/2». items — 16–21 КОНКРЕТНЫЙ термин темы (1–3 слова, без определений внутри), столько, чтобы хватило на 4–6 строк в каждой колонке; expectedAnswer — разнос по группам («Защита учётной записи: надёжный пароль, …; Защита компьютера и данных: антивирус, …»).
   - Одно задание — "checklist": «Отметь ✓, каким требованиям/признакам соответствует …». options — 4–6 конкретных утверждений (часть верные, часть нет); correctFlags — какие верные.
   - Одно задание — "open" на ПЕРЕЧИСЛЕНИЕ (не рассуждение): «Перечисли требования/признаки/свойства …» — 5 требований по теме, expectedAnswer — их перечень.
   - Одно задание — "match": options — 3–5 конкретных терминов темы, pairs — их РЕАЛЬНЫЕ определения (не «Описание А»); expectedAnswer — пары «1–Б, 2–А …».
   - Одно задание — "open" или "case_study": вопрос «Что такое …? Объясни, как работает и почему … Приведи примеры» + 5–8 строк для ответа; для case_study: situation — кейс 4–8 предложений с конкретными данными (числа, имена, ситуация), prompt — 1–3 вопроса по кейсу; expectedAnswer — эталонный разбор 2–5 предложений.
   - Одно задание — "interactive" (если count ≥ 5): prompt — «Отсканируй QR-код или перейди по ссылке. Выполни интерактив и запиши результат»; link — ТОЛЬКО null (учитель вставит свою ссылку Wordwall/LearningApps, НЕ выдумывай URL); expectedAnswer — что записать («Мой результат: …»).
   - Одно задание — "creative" (если count ≥ 6): prompt — пошаговая инструкция создать что-то с помощью ИИ/рисунка (персонаж, памятка, инфографика) + 3–5 конкретных требований (эмодзи-список допустим); expectedAnswer — критерии качества.
   При count < 6 выбери самые подходящие типы из списка, но конкретика обязательна всегда.
3. ОСТАЛЬНЫЕ ТИПЫ — только с конкретным содержанием:
   - "multiple_choice": 4 варианта, каждый — факт/число/пример по теме (не «изучается в N классе»); correctIndex (0..3).
   - "fill_bank": prompt — 3–6 пронумерованных предложений с "_____"; wordBank — 4–8 конкретных слов темы (1–2 лишних); expectedAnswer — предложения с вставленными словами.
   - "table_fix"/"scenario_fix": жизненная ситуация с 3–4 ошибками по теме; expectedAnswer — «ошибка → исправление».
   - "choice_buttons": 2–4 варианта-кнопки с данными; correctChoice + объяснение.
   - "fill": предложение с "_____" про конкретный факт (не «ключевое понятие темы»).
   - "true_false": конкретное проверяемое утверждение по теме (не «тема относится к предмету»).
   - "word_search": searchWords — 5–8 слов темы для поиска в сетке букв; expectedAnswer — список слов.
   - "ordering": orderItems — 4–6 элементов для упорядочивания (по времени, размеру, важности); expectedAnswer — правильная последовательность.
   - "odd_one_out": oddItems — 4–6 элементов, один лишний; oddIndex — индекс лишнего; oddReason — объяснение.
   - "categorize": categories — 2–3 категории; categoryItems — 6–10 элементов для распределения; expectedAnswer — разбивка по категориям.
4. СТИЛЬ: игровые формулировки («Помоги герою…», «Расследуй…», «Представь, что ты…»), современный язык для ${input.grade} класса, но без воды — каждое слово про тему.
5. ГЕНЕРАЦИЯ ИЛЛЮСТРАЦИЙ: для 2–3 самых визуальных заданий заполни imagePromptEn — детальный английский промпт без текста на картинке (No text, no words). Для остальных — null.
6. ЭТАПЫ: каждому заданию укажи stage — "start" (1–2 лёгких, 2–3 балла), "middle" (основная работа, 5–6 баллов), "end" (закрепление/рефлексия, 2–3 балла). Порядок в массиве: start → middle → end. Если заданий ≥ 5, ПОСЛЕДНИМ сделай "reflection" (points 0, reflectionOptions — ровно 3).
7. БАЛЛЫ И МЕТА: каждый task имеет criterion (проверяемое действие), descriptor (наблюдаемый результат), points. Сумма points ровно 10 (reflection — 0). Укажи intro (1–2 предложения про тему, не «демо») и metaLine ("ФИО ученика: ____ Класс: ${input.grade} Дата: ____").
8. ОТВЕТЫ УЧИТЕЛЮ: обязательно заполни expectedAnswer (open/fill/fill_bank/sort/checklist/case_study/table_fix/scenario_fix/choice_buttons/creative/interactive/word_search/ordering/odd_one_out/categorize), correctIndex (multiple_choice/true_false), correctChoice (choice_buttons), correctFlags (checklist), oddIndex+oddReason (odd_one_out). Без ключей лист считается браком.
9. СЛОЖНОСТЬ: каждому заданию укажи difficulty — "easy", "medium" или "hard" в соответствии с уровнем.
10. ФИНАЛЬНОЕ ЗАДАНИЕ: последним (перед reflection) добавь "creative" с коротким призывом и местом для ответа — «Придумай пример …:», «Составь свой …:». В лист оно печатается отдельной курсивной строкой внизу, поэтому не дублируй длинные инструкции.
11. ЭТАЛОН ОФОРМЛЕНИЯ (как в лучших листах, не копируй буквально — держи структуру): «Задание 1. Распредели элементы по двум направлениям.» → плашка «Слова для распределения:» и ДЛИННЫЙ список конкретных терминов → таблица из двух колонок с названиями направлений в шапке и пустыми высокими ячейками → «Задание 2. Перечисли/отметь …» → пронумерованные строки 1–5 для письменного ответа → финальная курсивная строка с призывом.
12. ВИЗУАЛЬНАЯ СТРУКТУРА ЛИСТА: короткий заголовок по теме, место для имени/класса/даты, отдельные хорошо различимые задания. Если тему можно изучать через изображения, добавь одно наблюдательное задание с 3–5 разными объектами/примерами и вопросом на определение или классификацию; для него заполни imagePromptEn. Добавь отдельное задание на сопоставление конкретных примеров с типами/категориями и одно задание с достаточным местом для письменного объяснения. Даже без сгенерированной иллюстрации задания должны оставаться полностью понятными по тексту.`;

  const schema = worksheetSchema();
  // Парсинг и валидация внутри executeWithFallback: битый JSON/структура
  // считается ошибкой попытки и переключает провайдера на следующего.
  let parsed: Omit<Worksheet, "kind">;
  try {
    parsed = await chatJson("tasks", "worksheet", schema, user, 0.6, (content) =>
      validateWorksheet(input, content),
    );
  } catch (err) {
    // Последний рубеж: AI недоступен (503/429/пустой ответ), но учитель всё
    // равно должен получить рабочий лист, а не 500. Отдаём методический
    // шаблон по той же схеме и с той же раскладкой баллов.
    log.warn("AI-лист недоступен, собираем локальный шаблон", {
      topic: input.topic,
      reason: err instanceof Error ? err.message : String(err),
    });
    return {
      kind: "worksheet",
      language: input.language,
      ...buildLocalWorksheet(input),
      degraded: true,
    };
  }

  // Добивка: модель часто отдаёт меньше заданий, чем просили (длинный JSON
  // обрывается, часть заданий не проходит валидацию). Без этого учитель
  // выбирал «5 заданий» и получал 2. Просим по одному недостающему, пока
  // не наберётся нужное количество.
  const target = Math.max(3, Math.min(input.count, 10));
  let filled: WorksheetTask[] = [];
  try {
    filled = await topUpWorksheetTasks(input, parsed.tasks);
  } catch (err) {
    // Добивка тоже может упасть: провайдер ушёл в 429 посреди задачи.
    // Раньше эта ошибка вылетала наружу и учитель получал 500 вместо листа,
    // хотя первую часть AI уже вернул и она годна к печати.
    log.warn("Добивка заданий не удалась, отдаём то, что есть", {
      topic: input.topic,
      reason: err instanceof Error ? err.message : String(err),
    });
  }

  if (filled.length < target) {
    if (filled.length >= 3) {
      // Трёх заданий достаточно для рабочего листа: предупреждаем и
      // печатаем, вместо того чтобы отнимать материал целиком.
      log.warn("Лист неполон", { topic: input.topic, have: filled.length, target });
      return {
        kind: "worksheet",
        language: input.language,
        ...parsed,
        tasks: enforceTenPoints(normalizeWorksheetTasks(filled)),
        degraded: true,
      };
    }
    // Меньше трёх — это не лист. Отдаём локальный шаблон: он гарантированно
    // собирается и печатается.
    log.warn("AI вернул слишком мало заданий, собираем локальный шаблон", {
      topic: input.topic,
      have: filled.length,
    });
    return {
      kind: "worksheet",
      language: input.language,
      ...buildLocalWorksheet(input),
      degraded: true,
    };
  }
  return { kind: "worksheet", language: input.language, ...parsed, tasks: enforceTenPoints(normalizeWorksheetTasks(filled)) };
}

/** Ключ задания для дедупликации при добивке. */
function taskKey(t: WorksheetTask): string {
  return `${t.type}:${t.prompt.toLowerCase().slice(0, 120)}`;
}

/**
 * Добирает недостающие задания по одному, не повторяя уже полученные.
 *
 * Отдельный вызов на задание вместо одного запроса «ещё N»: у модели
 * сбивается нумерация этапов и类型, а одиночная генерация (тем же
 * кодом, что regenerateWorksheetTask) даёт стабильный результат.
 */
async function topUpWorksheetTasks(
  input: HandoutInput,
  existing: WorksheetTask[],
): Promise<WorksheetTask[]> {
  const target = Math.max(3, Math.min(input.count, 10));
  const out = [...existing];
  const seen = new Set(out.map(taskKey));
  const attemptsLeft = target - out.length;
  if (attemptsLeft <= 0) return out;

  // Две дополнительные попытки компенсируют повторы, но ограничивают расход.
  let budget = Math.min(attemptsLeft + 2, 10);
  while (out.length < target && budget > 0) {
    budget -= 1;
    const avoid = out.map((t) => t.prompt).slice(-9);
    try {
      const single = await regenerateWorksheetTask({
        topic: input.topic,
        subject: input.subject,
        grade: input.grade,
        language: input.language,
        // Тип из этапа, который ещё не заполнен: распределяем по слотам.
        type: pickMissingType(out, target),
        stage: pickMissingStage(out, target),
        points: 0,
        kspContext: input.kspContext,
        avoidPrompts: avoid,
      });
      const key = taskKey(single);
      if (seen.has(key)) continue;
      seen.add(key);
      // Стартовая доля от бюджета 10 баллов; точную сумму доведёт
      // enforceTenPoints ниже. Ставить 0 нельзя: enforceTenPoints считает
      // points <= 0 «неоцениваемыми» и задание осталось бы без баллов.
      out.push({ ...single, points: Math.max(1, Math.round(10 / target)) });
    } catch {
      // Провайдер не смог — прекращаем добивку, отдаём что есть.
      break;
    }
  }
  return out;
}

/** Тип задания, которого в листе пока меньше всего. */
function pickMissingType(tasks: WorksheetTask[], target: number): WorksheetTaskType {
  const order: WorksheetTaskType[] = ["open", "multiple_choice", "match", "checklist", "fill_bank", "sort"];
  const quota = Math.ceil(target / order.length);
  for (const type of order) {
    if (tasks.filter((t) => t.type === type).length < quota) return type;
  }
  return order[0];
}

/** Этап, которого в листе пока меньше всего. */
function pickMissingStage(tasks: WorksheetTask[], target: number): "start" | "middle" | "end" {
  const stages = ["start", "middle", "end"] as const;
  const quota = Math.ceil(target / stages.length);
  for (const stage of stages) {
    if (tasks.filter((t) => t.stage === stage).length < quota) return stage;
  }
  return "middle";
}

export interface RegenTaskInput {
  topic: string;
  subject: string;
  grade: number;
  language: "ru" | "kz";
  type: WorksheetTaskType;
  stage: "start" | "middle" | "end";
  /** Баллы сохраняются как у заменяемого задания — сумма листа не меняется. */
  points: number;
  kspContext?: HandoutInput["kspContext"];
  /** Промпты соседних заданий — чтобы не повторяться. */
  avoidPrompts?: string[];
}

/**
 * Точечная замена одного задания: генерирует РОВНО ОДНО задание заданного
 * типа/этапа с готовыми ключами. Баллы и этап фиксируются вызывающим кодом.
 */
export async function regenerateWorksheetTask(input: RegenTaskInput): Promise<WorksheetTask> {
  const lang = input.language === "kz" ? "казахский" : "русский";
  const avoid = (input.avoidPrompts ?? []).map((p) => p.trim()).filter(Boolean).slice(0, 9);
  const user = `${input.language === "kz" ? "Барлық адам оқитын мәтінді қазақша жаз. Орысша тақырып берілсе, оны аудар." : ""}\nСоставь РОВНО ОДНО задание (tasks: массив из 1 элемента) типа "${input.type}" на ${lang} по теме «${input.topic}» для ${input.grade} класса (${input.subject}), этап урока "${input.stage}".
Правила качества: только конкретные факты темы (термины, числа, примеры) — без заглушек вида «Понятие 1», «Описание А». Обязательно: prompt, criterion (проверяемое действие), descriptor (наблюдаемый результат), все ключи типа (expectedAnswer / correctIndex / correctChoice / correctFlags / options+pairs / wordBank / groups+items / situation — что применимо), imagePromptEn — null. Для "interactive": link — null. Для "reflection": reflectionOptions — ровно 3.${avoid.length ? `\nНе повторяй эти соседние задания:\n${avoid.map((p) => `• ${p.slice(0, 200)}`).join("\n")}` : ""}
title/intro/metaLine — короткие нейтральные строки (не используются).`;
  const parsed = await chatJson("tasks", "worksheet_single", worksheetSchema(), user, 0.7, (content) =>
    validateWorksheet(
      { kind: "worksheet", topic: input.topic, subject: input.subject, grade: input.grade, language: input.language, count: 1, kspContext: input.kspContext },
      content,
    ),
  );
  const task = parsed.tasks.find((t) => t.type === input.type) ?? parsed.tasks[0];
  if (!task) throw new Error("AI не вернул задание");
  return { ...normalizeWorksheetTasks([task])[0], points: input.points, stage: input.stage };
}

async function aiFlashcards(input: HandoutInput): Promise<FlashcardSet> {
  const lang = input.language === "kz" ? "казахский" : "русский";
  const objectives = (input.kspContext?.learningObjectives ?? []).filter((o) => o.trim());
  const user = `${input.language === "kz" ? "Барлық карточка мәтінін қазақша жаз. Орысша тақырып берілсе, оны қазақшаға аудар." : ""}\nСоставь набор памяток-карточек (flashcards) на ${lang} по теме «${input.topic}» для ${input.grade} класса (${input.subject}).
Количество памяток: РОВНО ${input.count}.
Каждая карточка — самостоятельная мини-история, а не сухая пара «термин — определение»:
- front: один термин или короткий вопрос, 1–5 слов;
- back: понятное объяснение в 1–2 коротких предложениях;
- example: один конкретный пример, опыт, ситуация или применение по теме;
- checkQuestion: короткая проверка себя, на которую ученик может ответить без подсказки.
Карточки должны отличаться по роли: определение, пример, сравнение, правило, применение, частая ошибка, мини-задача. Не повторяй одну мысль разными словами. Не пиши «Понятие 1», «важный термин», «пример из жизни» без конкретики. Текст должен быть коротким, живым и понятным ученику ${input.grade} класса.${objectives.length ? `\nОпирайся на цели урока:\n${objectives.map((o) => `• ${o}`).join("\n")}` : ""}`;
  const parsed = await chatJson("tasks", "flashcards", flashcardsSchema(), user, 0.5, (content) => validateFlashcards(content, input.language));
  return { kind: "flashcards", language: input.language, ...parsed };
}

/**
 * Карточки с запасным путём.
 *
 * Отказ AI раньше заканчивался 500: учитель остался без памяток, хотя тема
 * и цели урока были известны. Теперь комплект собирается из слов темы, а
 * `degraded` честно сообщает интерфейсу, что формулировки нужно уточнить.
 */
async function flashcardsWithFallback(input: HandoutInput): Promise<FlashcardSet> {
  try {
    return await aiFlashcards(input);
  } catch (err) {
    log.warn("AI-памятки недоступны, собираем по словам темы", {
      topic: input.topic,
      reason: err instanceof Error ? err.message : String(err),
    });
    return buildLocalFlashcards(input);
  }
}

async function aiCrossword(input: HandoutInput): Promise<Crossword> {
  const objectives = (input.kspContext?.learningObjectives ?? []).filter((o) => o.trim());
  // Свои слова учителя: без AI, только нормализация и раскладка.
  if (input.customWords && input.customWords.length > 0) {
    const content = JSON.stringify({
      title: `${input.language === "kz" ? "Сөзжұмбақ" : "Кроссворд"}: ${input.topic}`,
      intro: "",
      words: input.customWords,
    });
    const parsed = validateCrossword(content, input.language);
    return { ...layoutCrossword(parsed.words, parsed.title, parsed.intro), language: input.language };
  }
  const user = `${input.language === "kz" ? "Кроссвордтың сөздері мен барлық анықтамаларын қазақша жаз. Қазақ әліпбиіндегі Ә, Ғ, Қ, Ң, Ө, Ұ, Ү, Һ, І әріптерін дұрыс сақта." : ""}\nПодбери ${input.count} ключевых слов по теме «${input.topic}» (${input.subject}, ${input.grade} класс) для кроссворда.
Слова — существительные в именительном падеже, длина 3–12 букв, БЕЗ пробелов и дефисов. Желательно с общими буквами для пересечений.
Для каждого — короткое определение-подсказка (clue) на ${input.language === "kz" ? "казахском" : "русском"}.${objectives.length ? `\nСлова должны отражать цели урока:\n${objectives.map((o) => `• ${o}`).join("\n")}` : ""}`;
  const parsed = await chatJson("tasks", "crossword_words", crosswordSchema(), user, 0.5, (content) => validateCrossword(content, input.language));
  return { ...layoutCrossword(parsed.words, parsed.title, parsed.intro), language: input.language };
}

/**
 * Кроссворд с запасным путём.
 *
 * Пустой кроссворд учителю бесполезен, поэтому если из темы не набирается
 * трёх слов, возвращается понятная ошибка с подсказкой, а не документ с
 * одним заголовком. Всё остальное собирается и печатается.
 */
async function crosswordWithFallback(input: HandoutInput): Promise<Crossword> {
  try {
    return await aiCrossword(input);
  } catch (err) {
    const fallback = buildLocalCrossword(input);
    if (fallback.grid.length === 0) {
      throw new Error(
        input.language === "kz"
          ? `Кроссворд собрать не удалось: в теме «${input.topic}» меньше трёх слов длиной от 3 букв. Укажите слова самостоятельно.`
          : `Не удалось собрать кроссворд: в теме «${input.topic}» меньше трёх слов длиной от 3 букв. Укажите слова самостоятельно.`,
      );
    }
    log.warn("AI-кроссворд недоступен, собираем по словам темы", {
      topic: input.topic,
      reason: err instanceof Error ? err.message : String(err),
      words: fallback.placed.length,
    });
    return { ...fallback, degraded: true };
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) return null;
  return v as string[];
}

function optionalString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function validateWorksheet(input: HandoutInput, content: string): Omit<Worksheet, "kind"> {
  const raw: unknown = extractJson(content);
  if (!isRecord(raw)) throw new Error("AI: ответ не объект");
  const tasksRaw = raw.tasks;
  if (!Array.isArray(tasksRaw) || tasksRaw.length === 0 || tasksRaw.length > 10) {
    throw new Error("AI: некорректное число заданий");
  }
  const tasks: WorksheetTask[] = tasksRaw.map((t, i) => {
    if (!isRecord(t)) throw new Error(`AI: задание ${i + 1} не объект`);
    const prompt = t.prompt, criterion = t.criterion, descriptor = t.descriptor;
    if (typeof prompt !== "string" || !prompt.trim()) throw new Error(`AI: задание ${i + 1} без prompt`);
    if (typeof criterion !== "string" || !criterion.trim()) throw new Error(`AI: задание ${i + 1} без criterion`);
    if (typeof descriptor !== "string" || !descriptor.trim()) throw new Error(`AI: задание ${i + 1} без descriptor`);
    assertConcrete(prompt, i, "prompt");
    const imagePromptEn = optionalString(t.imagePromptEn) ?? undefined;
    const base = { prompt, criterion, descriptor, points: 1, stage: parseStage(t.stage), imagePromptEn };
    if (t.type === "open") {
      const expectedAnswer = optionalString(t.expectedAnswer);
      if (!expectedAnswer) throw new Error(`AI: open задание ${i + 1} без expectedAnswer`);
      return { ...base, type: "open" as const, expectedAnswer };
    }
    if (t.type === "fill") {
      if (!prompt.includes("_____")) throw new Error(`AI: fill задание ${i + 1} без _____`);
      const expectedAnswer = optionalString(t.expectedAnswer);
      if (!expectedAnswer) throw new Error(`AI: fill задание ${i + 1} без expectedAnswer`);
      assertConcrete(expectedAnswer, i, "expectedAnswer");
      return { ...base, type: "fill" as const, expectedAnswer };
    }
    if (t.type === "true_false") {
      if (t.correctIndex !== 0 && t.correctIndex !== 1) throw new Error(`AI: true_false задание ${i + 1} без correctIndex`);
      assertConcrete(prompt, i, "prompt");
      return { ...base, type: "true_false" as const, correctIndex: t.correctIndex, expectedAnswer: optionalString(t.expectedAnswer) };
    }
    if (t.type === "multiple_choice") {
      const options = asStringArray(t.options);
      const ci = t.correctIndex;
      if (!options || options.length < 2) throw new Error(`AI: multiple_choice задание ${i + 1} без вариантов`);
      if (typeof ci !== "number" || ci < 0 || ci >= options.length) throw new Error(`AI: multiple_choice задание ${i + 1} с неверным correctIndex`);
      for (const o of options) assertConcrete(o, i, "options");
      return { ...base, type: "multiple_choice" as const, options, correctIndex: ci };
    }
    if (t.type === "match") {
      const options = asStringArray(t.options);
      const pairs = asStringArray(t.pairs);
      if (!options || !pairs || options.length < 2 || options.length !== pairs.length) {
        throw new Error(`AI: match задание ${i + 1} без пар`);
      }
      for (const o of [...options, ...pairs]) assertConcrete(o, i, "match");
      const expectedAnswer = optionalString(t.expectedAnswer);
      if (!expectedAnswer) throw new Error(`AI: match задание ${i + 1} без expectedAnswer (пары 1–Б …)`);
      return { ...base, type: "match" as const, options, pairs, expectedAnswer };
    }
    if (t.type === "sort") {
      const groupsRaw = asStringArray(t.groups);
      const items = asStringArray(t.items);
      if (!groupsRaw || groupsRaw.length !== 2 || !groupsRaw[0].trim() || !groupsRaw[1].trim()) {
        throw new Error(`AI: sort задание ${i + 1} без двух groups`);
      }
      if (!items || items.length < 8) throw new Error(`AI: sort задание ${i + 1}: нужно ≥ 8 терминов`);
      for (const o of [...groupsRaw, ...items]) assertConcrete(o, i, "sort");
      const expectedAnswer = optionalString(t.expectedAnswer);
      if (!expectedAnswer) throw new Error(`AI: sort задание ${i + 1} без expectedAnswer (разнос по группам)`);
      return { ...base, type: "sort" as const, groups: [groupsRaw[0], groupsRaw[1]] as [string, string], items, expectedAnswer };
    }
    if (t.type === "checklist") {
      const options = asStringArray(t.options);
      if (!options || options.length < 3) throw new Error(`AI: checklist задание ${i + 1} без пунктов`);
      if (!Array.isArray(t.correctFlags) || t.correctFlags.length !== options.length || !t.correctFlags.some((f) => f === true)) {
        throw new Error(`AI: checklist задание ${i + 1} без correctFlags`);
      }
      for (const o of options) assertConcrete(o, i, "checklist");
      return { ...base, type: "checklist" as const, options, correctFlags: t.correctFlags as boolean[], expectedAnswer: optionalString(t.expectedAnswer) };
    }
    if (t.type === "case_study") {
      const situation = optionalString(t.situation);
      if (!situation || situation.length < 80) throw new Error(`AI: case_study задание ${i + 1} без situation (нужен кейс с данными)`);
      assertConcrete(situation, i, "situation");
      const expectedAnswer = optionalString(t.expectedAnswer);
      if (!expectedAnswer) throw new Error(`AI: case_study задание ${i + 1} без expectedAnswer`);
      return { ...base, type: "case_study" as const, situation, expectedAnswer };
    }
    return validateRichTaskType(base, t, i);
  });
  const title = raw.title, intro = raw.intro, metaLine = raw.metaLine;
  if (typeof title !== "string" || !title.trim()) throw new Error("AI: нет title");
  if (typeof intro !== "string" || !intro.trim()) throw new Error("AI: нет intro");
  assertKazakhContent(raw, input.language, "жұмыс парағы");
  return {
    title, intro,
    metaLine: typeof metaLine === "string" && metaLine.trim() ? metaLine : input.language === "kz"
      ? `Оқушының аты-жөні: ____ Сынып: ${input.grade} Күні: ____`
      : `ФИО ученика: ____ Класс: ${input.grade} Дата: ____`,
    tasks: normalizeWorksheetTasks(tasks),
  };
}

/** Запрет абстрактных заглушек: лист должен работать с фактами темы. */
const FORBIDDEN_FRAGMENTS = [
  "понятие 1", "понятие 2", "понятие 3",
  "описание a", "описание b", "описание c",
  "описание а", "описание б", "описание в",
  "относится к предмету", "ключевое понятие нашей темы",
  "название следующей четверти", "вид домашнего задания",
];

function assertConcrete(text: string, index: number, field: string): void {
  const low = text.toLowerCase();
  for (const frag of FORBIDDEN_FRAGMENTS) {
    if (low.includes(frag)) {
      throw new Error(`AI: задание ${index + 1} (${field}): абстрактная заглушка «${frag}» — нужны факты темы`);
    }
  }
}

/** Эталонные типы заданий: «вставь слова», таблица-исправление, сценарий, кнопки, рефлексия. */
function validateRichTaskType(
  base: { prompt: string; criterion: string; descriptor: string; points: number },
  t: Record<string, unknown>,
  i: number,
): WorksheetTask {
  if (t.type === "fill_bank") {
    const wordBank = (asStringArray(t.wordBank) ?? []).map((word) => word.trim()).filter(Boolean);
    if (wordBank.length < 3) throw new Error(`AI: fill_bank задание ${i + 1} без банка слов`);
    for (const w of wordBank) assertConcrete(w, i, "wordBank");
    const expectedAnswer = optionalString(t.expectedAnswer);
    if (!expectedAnswer) throw new Error(`AI: fill_bank задание ${i + 1} без expectedAnswer`);
    return { ...base, type: "fill_bank" as const, wordBank, expectedAnswer };
  }
  if (t.type === "table_fix") {
    const headers = (asStringArray(t.tableHeaders) ?? []).map((header) => header.trim()).filter(Boolean);
    const first = headers[0], second = headers[1];
    const expectedAnswer = optionalString(t.expectedAnswer);
    if (!expectedAnswer) throw new Error(`AI: table_fix задание ${i + 1} без expectedAnswer`);
    return {
      ...base,
      type: "table_fix" as const,
      tableHeaders: first && second ? ([first, second] as [string, string]) : undefined,
      tableRows: typeof t.tableRows === "number" ? t.tableRows : undefined,
      expectedAnswer,
    };
  }
  if (t.type === "scenario_fix") {
    const situation = optionalString(t.situation);
    if (!situation) throw new Error(`AI: scenario_fix задание ${i + 1} без situation`);
    assertConcrete(situation, i, "situation");
    const expectedAnswer = optionalString(t.expectedAnswer);
    if (!expectedAnswer) throw new Error(`AI: scenario_fix задание ${i + 1} без expectedAnswer`);
    return {
      ...base,
      type: "scenario_fix" as const,
      situation,
      errorsCount: typeof t.errorsCount === "number" ? t.errorsCount : undefined,
      expectedAnswer,
    };
  }
  if (t.type === "choice_buttons") {
    const choices = (asStringArray(t.choices) ?? []).map((choice) => choice.trim()).filter(Boolean);
    if (choices.length < 2) throw new Error(`AI: choice_buttons задание ${i + 1} без вариантов`);
    for (const c of choices) assertConcrete(c, i, "choices");
    return {
      ...base,
      type: "choice_buttons" as const,
      choices,
      correctChoice: typeof t.correctChoice === "number" ? t.correctChoice : undefined,
      expectedAnswer: optionalString(t.expectedAnswer),
    };
  }
  if (t.type === "reflection") {
    const reflectionOptions = (asStringArray(t.reflectionOptions) ?? []).map((option) => option.trim()).filter(Boolean);
    if (reflectionOptions.length !== 3) throw new Error(`AI: reflection задание ${i + 1} должно содержать ровно три варианта`);
    return { ...base, type: "reflection" as const, reflectionOptions };
  }
  if (t.type === "interactive") {
    const link = optionalString(t.link);
    if (link) throw new Error(`AI: interactive задание ${i + 1}: ссылка должна оставаться пустой, её добавит учитель`);
    const expectedAnswer = optionalString(t.expectedAnswer);
    if (!expectedAnswer) throw new Error(`AI: interactive задание ${i + 1} без инструкции, что записать в результат`);
    return { ...base, type: "interactive" as const, link: undefined, expectedAnswer };
  }
  if (t.type === "creative") {
    const expectedAnswer = optionalString(t.expectedAnswer);
    if (!expectedAnswer) throw new Error(`AI: creative задание ${i + 1} без expectedAnswer (критерии)`);
    assertConcrete(base.prompt, i, "prompt");
    return { ...base, type: "creative" as const, expectedAnswer };
  }
  if (t.type === "word_search") {
    const searchWords = (asStringArray(t.searchWords) ?? []).map((w) => w.trim()).filter(Boolean);
    if (searchWords.length < 3) throw new Error(`AI: word_search задание ${i + 1}: нужно ≥ 3 слов`);
    for (const w of searchWords) assertConcrete(w, i, "searchWords");
    const expectedAnswer = optionalString(t.expectedAnswer);
    if (!expectedAnswer) throw new Error(`AI: word_search задание ${i + 1} без expectedAnswer`);
    return { ...base, type: "word_search" as const, searchWords, expectedAnswer };
  }
  if (t.type === "ordering") {
    const orderItems = (asStringArray(t.orderItems) ?? []).map((w) => w.trim()).filter(Boolean);
    if (orderItems.length < 3) throw new Error(`AI: ordering задание ${i + 1}: нужно ≥ 3 элементов`);
    for (const w of orderItems) assertConcrete(w, i, "orderItems");
    const expectedAnswer = optionalString(t.expectedAnswer);
    if (!expectedAnswer) throw new Error(`AI: ordering задание ${i + 1} без expectedAnswer`);
    return { ...base, type: "ordering" as const, orderItems, expectedAnswer };
  }
  if (t.type === "odd_one_out") {
    const oddItems = (asStringArray(t.oddItems) ?? []).map((w) => w.trim()).filter(Boolean);
    if (oddItems.length < 3) throw new Error(`AI: odd_one_out задание ${i + 1}: нужно ≥ 3 элементов`);
    for (const w of oddItems) assertConcrete(w, i, "oddItems");
    const oddIndex = t.oddIndex;
    if (typeof oddIndex !== "number" || oddIndex < 0 || oddIndex >= oddItems.length) {
      throw new Error(`AI: odd_one_out задание ${i + 1}: неверный oddIndex`);
    }
    const oddReason = optionalString(t.oddReason);
    if (!oddReason) throw new Error(`AI: odd_one_out задание ${i + 1} без oddReason`);
    return { ...base, type: "odd_one_out" as const, oddItems, oddIndex, oddReason, expectedAnswer: optionalString(t.expectedAnswer) };
  }
  if (t.type === "categorize") {
    const categories = (asStringArray(t.categories) ?? []).map((c) => c.trim()).filter(Boolean);
    if (categories.length < 2) throw new Error(`AI: categorize задание ${i + 1}: нужно ≥ 2 категорий`);
    const categoryItems = (asStringArray(t.categoryItems) ?? []).map((w) => w.trim()).filter(Boolean);
    if (categoryItems.length < 4) throw new Error(`AI: categorize задание ${i + 1}: нужно ≥ 4 элементов`);
    for (const w of [...categories, ...categoryItems]) assertConcrete(w, i, "categorize");
    const expectedAnswer = optionalString(t.expectedAnswer);
    if (!expectedAnswer) throw new Error(`AI: categorize задание ${i + 1} без expectedAnswer`);
    return { ...base, type: "categorize" as const, categories, categoryItems, expectedAnswer };
  }
  throw new Error(`AI: задание ${i + 1} неизвестного типа (${String(t.type)})`);
}

/** Этап урока для группировки заданий: начало / середина / конец. */
function parseStage(v: unknown): "start" | "middle" | "end" | undefined {
  return v === "start" || v === "middle" || v === "end" ? v : undefined;
}

function validateFlashcards(content: string, language: "ru" | "kz" = "ru"): { title: string; intro: string; cards: Flashcard[] } {
  const raw: unknown = extractJson(content);
  if (!isRecord(raw) || !Array.isArray(raw.cards) || raw.cards.length === 0) {
    throw new Error("AI: некорректный набор карточек");
  }
  const cards = raw.cards.map((c, i) => {
    if (!isRecord(c) || typeof c.front !== "string" || !c.front.trim() || typeof c.back !== "string" || !c.back.trim() || typeof c.example !== "string" || !c.example.trim() || typeof c.checkQuestion !== "string" || !c.checkQuestion.trim()) {
      throw new Error(`AI: карточка ${i + 1} должна содержать front, back, example и checkQuestion`);
    }
    const front = c.front.trim();
    const back = c.back.trim();
    const example = c.example.trim();
    const checkQuestion = c.checkQuestion.trim();
    if (front.length > 80 || back.length > 360 || example.length > 280 || checkQuestion.length > 180) {
      throw new Error(`AI: карточка ${i + 1} слишком длинная для печатного формата`);
    }
    assertConcrete(`${front} ${back} ${example} ${checkQuestion}`, i, "flashcard");
    return { front, back, example, checkQuestion };
  });
  if (typeof raw.title !== "string" || !raw.title.trim()) throw new Error("AI: нет title");
  assertKazakhContent(raw, language, "карточкалар");
  return { title: raw.title, intro: typeof raw.intro === "string" ? raw.intro : "", cards };
}

function validateCrossword(content: string, language: "ru" | "kz" = "ru"): { title: string; intro: string; words: CrosswordWord[] } {
  const raw: unknown = extractJson(content);
  if (!isRecord(raw) || !Array.isArray(raw.words)) throw new Error("AI: некорректные слова кроссворда");
  const words: CrosswordWord[] = [];
  for (const w of raw.words) {
    if (!isRecord(w) || typeof w.word !== "string" || typeof w.clue !== "string") continue;
    // Қазақ әріптері кроссвордта сақталуы тиіс: Ә, Ғ, Қ, Ң, Ө, Ұ, Ү, Һ, І.
    const word = w.word.trim().toUpperCase().replace(/[^А-ЯЁӘҒҚҢӨҰҮҺІA-Z]/g, "");
    if (word.length >= 3 && word.length <= 12) words.push({ word, clue: w.clue.trim() });
  }
  if (words.length < 3) throw new Error("AI: слишком мало подходящих слов");
  if (typeof raw.title !== "string" || !raw.title.trim()) throw new Error("AI: нет title");
  assertKazakhContent(raw, language, "сөзжұмбақ");
  return { title: raw.title, intro: typeof raw.intro === "string" ? raw.intro : "", words };
}

/** Отсекает ответы, где казахский режим содержит заметные русские фрагменты. */
function assertKazakhContent(value: unknown, language: "ru" | "kz", item: string): void {
  if (language !== "kz") return;
  const parts: string[] = [];
  const visit = (node: unknown, key = "") => {
    if (typeof node === "string") {
      if (key !== "imagePromptEn") parts.push(node);
    } else if (Array.isArray(node)) {
      node.forEach((entry) => visit(entry, key));
    } else if (isRecord(node)) {
      Object.entries(node).forEach(([childKey, child]) => visit(child, childKey));
    }
  };
  visit(value);
  const text = parts.join(" ").toLocaleLowerCase("ru-RU");
  const russianOnlyWords = /(?<![\p{L}\p{N}_])(?:задание|задания|учащиеся|ученик|ученика|выполни|соедини|найди|отметь|распредели|объясни|перечисли|укажите|выберите|ответы|критерий|дескриптор|обучения|решение|исправление|таблица|запиши|подчеркни|определение|покажи|правильный|неправильный|группа|ошибка|класс|дата|фио)(?![\p{L}\p{N}_])/gu;
  const matches = text.match(russianOnlyWords) ?? [];
  if (matches.length >= 3) {
    throw new Error(`AI: ${item} contains Russian text in Kazakh mode; regenerate in Kazakh`);
  }
}

async function chatJson<T>(
  task: "tasks",
  name: string,
  schema: Record<string, unknown>,
  user: string,
  temperature: number,
  validate: (content: string) => T,
): Promise<T> {
  if (isAnyProviderConfigured()) {
    return executeWithFallback(task, async (client, model, config) => {
      const response = await client.chat.completions.create({
        model,
        temperature,
        // Бюджет ответа берём у провайдера: без него Groq считает по своему
        // дефолту и отвечает 429, если модель лимитирована по OTPM.
        max_completion_tokens: config.maxTokens ?? 8192,
        messages: [{ role: "system", content: `${SYSTEM}\nJSON Schema: ${JSON.stringify(schema)}` }, { role: "user", content: user }],
        response_format: getResponseFormat(config, { name, schema }),
      });
      // Валидация здесь → ошибка структуры срывает попытку этого провайдера
      // и запускает следующий, а не доходит до рендера как «успех».
      return validate(response.choices[0]?.message.content ?? "");
    });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini", temperature,
    messages: [{ role: "system", content: `${SYSTEM}\nJSON Schema: ${JSON.stringify(schema)}` }, { role: "user", content: user }],
    response_format: { type: "json_schema", json_schema: { name, schema, strict: true } },
  });
  return validate(response.choices[0]?.message.content ?? "");
}

/**
 * Схема задания рабочего листа. Для strict-режима OpenAI все свойства должны
 * быть перечислены в `required` (необязательные — через тип ["…", "null"]),
 * поэтому nullable-поля эталонных типов тоже в required.
 */
const WORKSHEET_TASK_FIELDS = [
  "type",
  "prompt",
  "criterion",
  "descriptor",
  "points",
  "options",
  "pairs",
  "correctIndex",
  "expectedAnswer",
  "wordBank",
  "tableHeaders",
  "tableRows",
  "situation",
  "errorsCount",
  "choices",
  "correctChoice",
  "reflectionOptions",
  "teacherNote",
  "stage",
  "link",
  "imagePromptEn",
  "groups",
  "items",
  "correctFlags",
  "difficulty",
  "searchWords",
  "letterGrid",
  "orderItems",
  "correctOrder",
  "oddItems",
  "oddIndex",
  "oddReason",
  "categories",
  "categoryItems",
  "categoryAnswer",
] as const;

function worksheetSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "intro", "metaLine", "tasks"],
    properties: {
      title: { type: "string" },
      intro: { type: "string" },
      metaLine: { type: "string" },
      tasks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [...WORKSHEET_TASK_FIELDS],
          properties: {
            type: { type: "string", enum: ["open", "fill", "multiple_choice", "match", "true_false", "sort", "checklist", "case_study", "fill_bank", "table_fix", "scenario_fix", "choice_buttons", "reflection", "interactive", "creative", "word_search", "ordering", "odd_one_out", "categorize"] },
            stage: { type: ["string", "null"], enum: ["start", "middle", "end", null] },
            prompt: { type: "string" },
            criterion: { type: "string" },
            descriptor: { type: "string" },
            points: { type: "integer", minimum: 0, maximum: 10 },
            options: { type: ["array", "null"], items: { type: "string" } },
            pairs: { type: ["array", "null"], items: { type: "string" } },
            correctIndex: { type: ["integer", "null"] },
            expectedAnswer: { type: ["string", "null"] },
            wordBank: { type: ["array", "null"], items: { type: "string" } },
            tableHeaders: { type: ["array", "null"], items: { type: "string" } },
            tableRows: { type: ["integer", "null"] },
            situation: { type: ["string", "null"] },
            errorsCount: { type: ["integer", "null"] },
            choices: { type: ["array", "null"], items: { type: "string" } },
            correctChoice: { type: ["integer", "null"] },
            reflectionOptions: { type: ["array", "null"], items: { type: "string" } },
            teacherNote: { type: ["string", "null"] },
            link: { type: ["string", "null"] },
            imagePromptEn: { type: ["string", "null"], description: "Детальный английский промпт для генерации иллюстрации к заданию (если нужна)" },
            groups: { type: ["array", "null"], items: { type: "string" } },
            items: { type: ["array", "null"], items: { type: "string" } },
            correctFlags: { type: ["array", "null"], items: { type: "boolean" } },
            difficulty: { type: ["string", "null"], enum: ["easy", "medium", "hard", null] },
            searchWords: { type: ["array", "null"], items: { type: "string" } },
            letterGrid: { type: ["array", "null"], items: { type: "array", items: { type: "string" } } },
            orderItems: { type: ["array", "null"], items: { type: "string" } },
            correctOrder: { type: ["array", "null"], items: { type: "integer" } },
            oddItems: { type: ["array", "null"], items: { type: "string" } },
            oddIndex: { type: ["integer", "null"] },
            oddReason: { type: ["string", "null"] },
            categories: { type: ["array", "null"], items: { type: "string" } },
            categoryItems: { type: ["array", "null"], items: { type: "string" } },
            // Разбивка по категориям хранится как строки «категория: элемент»:
            // произвольный объект без additionalProperties:false Groq и другие
            // провайдеры со strict-схемой отвергали целиком — падал весь лист.
            categoryAnswer: { type: ["array", "null"], items: { type: "string" } },
          },
        },
      },
    },
  };
}

function flashcardsSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "intro", "cards"],
    properties: {
      title: { type: "string" },
      intro: { type: "string" },
      cards: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["front", "back", "example", "checkQuestion"],
          properties: {
            front: { type: "string" },
            back: { type: "string" },
            example: { type: "string" },
            checkQuestion: { type: "string" },
          },
        },
      },
    },
  };
}

function crosswordSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "intro", "words"],
    properties: {
      title: { type: "string" },
      intro: { type: "string" },
      words: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["word", "clue"],
          properties: {
            word: { type: "string" },
            clue: { type: "string" },
          },
        },
      },
    },
  };
}

/**
 * Нормализация заданий после AI: обрезка строк, чистка массивов,
 * защита от пустых промптов. Вызывается и для AI-ответа, и для заглушки.
 */
function normalizeWorksheetTasks(tasks: WorksheetTask[]): WorksheetTask[] {
  return tasks
    .map((task) => {
      const normalized: WorksheetTask = {
        ...task,
        prompt: task.prompt.trim(),
        criterion: task.criterion.trim(),
        descriptor: task.descriptor.trim(),
        points: Number.isFinite(task.points) ? Math.max(0, Math.round(task.points)) : 0,
      };
      if (normalized.options) normalized.options = normalized.options.map((o) => o.trim()).filter(Boolean);
      if (normalized.pairs) normalized.pairs = normalized.pairs.map((p) => p.trim()).filter(Boolean);
      if (normalized.wordBank) normalized.wordBank = normalized.wordBank.map((w) => w.trim()).filter(Boolean);
      if (normalized.choices) normalized.choices = normalized.choices.map((c) => c.trim()).filter(Boolean);
      if (normalized.items) normalized.items = normalized.items.map((w) => w.trim()).filter(Boolean);
      if (normalized.groups) normalized.groups = normalized.groups.map((g) => g.trim()).filter(Boolean) as [string, string];
      if (normalized.reflectionOptions) {
        normalized.reflectionOptions = normalized.reflectionOptions.map((o) => o.trim()).filter(Boolean);
      }
      if (normalized.searchWords) normalized.searchWords = normalized.searchWords.map((w) => w.trim()).filter(Boolean);
      if (normalized.orderItems) normalized.orderItems = normalized.orderItems.map((w) => w.trim()).filter(Boolean);
      if (normalized.oddItems) normalized.oddItems = normalized.oddItems.map((w) => w.trim()).filter(Boolean);
      if (normalized.categories) normalized.categories = normalized.categories.map((c) => c.trim()).filter(Boolean);
      if (normalized.categoryItems) normalized.categoryItems = normalized.categoryItems.map((w) => w.trim()).filter(Boolean);
      return normalized;
    })
    .filter((task) => task.prompt.length > 0);
}

/**
 * Сколько «труда» стоит задание — определяет его долю в 10 баллах.
 *
 * Модель ставит баллы произвольно: в реальном прогоне «Придумай пример»
 * получало 7 баллов, а распределение 18 терминов по двум колонкам — 1.
 * Поэтому вес считаем сами, а мнение модели используем лишь как слабый
 * сигнал (треть веса), чтобы не потерять методический замысел.
 */
function taskWeight(task: WorksheetTask): number {
  const base: Record<string, number> = {
    sort: 5,               // длинный банк терминов, самое трудоёмкое
    case_study: 5,
    table_fix: 4,
    scenario_fix: 4,
    fill_bank: 4,
    categorize: 3,
    match: 3,
    checklist: 3,
    open: 3,
    word_search: 2,
    ordering: 2,
    odd_one_out: 2,
    multiple_choice: 2,
    choice_buttons: 2,
    true_false: 1,
    fill: 1,
    interactive: 1,        // «отсканируй QR и запиши результат» — на минуту
    creative: 1,           // финальное задание-замысел
  };
  let weight = base[task.type] ?? 2;
  // Объём задания тоже важен: 18 терминов тяжелее 4.
  const volume = task.items?.length ?? task.categoryItems?.length ?? task.options?.length ?? 0;
  if (volume > 8) weight += 1;
  // Мнение модели — только треть веса, иначе перекос возвращается.
  return weight * 2 + Math.min(3, Math.max(0, task.points));
}

/**
 * Жёсткий бюджет урока: сумма баллов оцениваемых заданий всегда ровно 10,
 * независимо от того, что вернул AI. Рефлексия всегда 0 баллов.
 *
 * Распределение — методом наибольших остатков по весам, с минимумом 1 балл
 * на задание, поэтому лёгкое «creative» больше не съедает половину листа.
 */
export function enforceTenPoints(tasks: WorksheetTask[]): WorksheetTask[] {
  // Рефлексия не оценивается — даже если модель поставила ей баллы.
  tasks.forEach((task) => {
    if (task.type === "reflection") task.points = 0;
  });
  const scored = tasks.filter((t) => t.type !== "reflection");
  if (scored.length === 0) return tasks;
  if (scored.length > 10) {
    // Больше 10 заданий физически не влезают в бюджет 10 баллов.
    scored.forEach((t, i) => { t.points = i < 10 ? 1 : 0; });
    return tasks;
  }

  const min = 1;
  const rest = 10 - scored.length * min; // баллы сверх минимума
  const weights = scored.map(taskWeight);
  const totalWeight = weights.reduce((s, w) => s + w, 0);

  // Сначала дробная часть, затем добор остатка по максимальному остатку.
  const shares = weights.map((w) => (rest * w) / totalWeight);
  const floors = shares.map((s) => Math.floor(s));
  let assigned = floors.reduce((s, v) => s + v, 0);
  const order = shares
    .map((share, i) => ({ i, frac: share - Math.floor(share) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; assigned < rest && k < order.length; k += 1) {
    floors[order[k].i] += 1;
    assigned += 1;
  }
  scored.forEach((task, i) => { task.points = min + floors[i]; });
  return tasks;
}
