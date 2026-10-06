/**
 * Раздаточные материалы (handouts), генерируемые AI по теме урока.
 *
 * Все типы хранят достаточно структуры, чтобы их можно было превратить:
 *  - в .docx (для печати в школе),
 *  - в JSON (для повторной редакции / превью на странице),
 *  - в PDF (через печать страницы предпросмотра).
 *
 * Дизайн ориентирован на классический эталон рабочего листа РК:
 * баннер «Задание №N. …», таблицы с тёмно-синей рамкой и цветной шапкой,
 * облако-сценарий, кнопки-варианты ответа, блок дескрипторов учителю,
 * рефлексия-смайлики в конце.
 */

export type HandoutKind = "worksheet" | "flashcards" | "crossword";

/**
 * Типы заданий рабочего листа.
 * Базовые (были раньше): open, fill, multiple_choice, match, true_false.
 * Под эталон качественных листов (см. СВОИ КСП 2026):
 * - sort — «Распредели по группам»: groups (2 названия), items (12–20 терминов),
 *   ученик разносит термины по двум колонкам;
 * - checklist — «Отметь ✓»: options — утверждения (4–6), correctFlags — какие верные,
 *   плюс поле mini-task «придумай свой пример»;
 * - case_study — кейс с вопросами: situation (4–8 предложений с конкретными
 *   данными: числа, имена, факты), prompt — 1–3 вопроса по кейсу;
 * - fill_bank — вставь пропущенные слова из банка слов;
 * - table_fix — задание с таблицей «Что неправильно? / Как исправить?»
 *   (анализ рисунка или ситуации);
 * - scenario_fix — облако-сценарий + строки «Ошибка N / Исправление»
 *   (найди N ошибок и напиши, как исправить);
 * - choice_buttons — выбери один вариант из кнопок (напр. «Какое место
 *   лучше выбрать?») с полем «Общий балл»;
 * - reflection — рефлексия: выбери смайлик (понял / сомневаюсь /
 *   нужна помощь), печатается кнопками-выбора.
 */
export type WorksheetTaskType =
  | "open" // открытый вопрос
  | "fill" // заполнить пропуск
  | "multiple_choice" // 1 правильный из 4
  | "match" // соединить пары
  | "true_false" // верно/неверно
  | "sort" // распределить термины по 2 группам
  | "checklist" // отметить верные утверждения + свой пример
  | "case_study" // кейс с данными + вопросы
  | "fill_bank" // вставить слова из банка
  | "table_fix" // таблица «Что неправильно / Как исправить»
  | "scenario_fix" // сценарий-облако + ошибки/исправления
  | "choice_buttons" // выбор варианта-кнопки
  | "reflection" // рефлексия-смайлики
  | "interactive" // интерактив по QR/ссылке (Wordwall и т.п.)
  | "creative" // творческое задание (с ИИ / рисунок)
  | "word_search" // поиск слов в сетке букв
  | "ordering" // упорядочивание элементов
  | "odd_one_out" // найди лишнее
  | "categorize"; // классификация по категориям

/** Уровень сложности задания. */
export type DifficultyLevel = "easy" | "medium" | "hard";

/** Этап урока, к которому относится задание (баннер-разделитель в листе). */
export type WorksheetStage = "start" | "middle" | "end";

export interface WorksheetTask {
  type: WorksheetTaskType;
  prompt: string;
  /** Этап урока: начало / середина / конец (баннер-разделитель). */
  stage?: WorksheetStage;
  /** Проверяемое действие ученика, по которому оценивается задание. */
  criterion: string;
  /** Конкретный наблюдаемый результат выполнения задания. */
  descriptor: string;
  /** Баллы за задание. Во всём рабочем листе сумма всегда равна 10. */
  points: number;
  /** Для multiple_choice — варианты; для match — левая колонка. */
  options?: string[];
  /** Для match — правая колонка (длина равна options). */
  pairs?: string[];
  /** Индекс правильного ответа для multiple_choice или 0/1 для true_false. */
  correctIndex?: number;
  /** Открытый ответ (если есть эталон). */
  expectedAnswer?: string;
  /**
   * Банк слов для fill_bank: слова, из которых ученик выбирает
   * пропущенные слова (печатается рамкой над заданием).
   */
  wordBank?: string[];
  /**
   * Для sort: названия двух групп (печатаются шапкой таблицы,
   * ученик распределяет items по колонкам).
   */
  groups?: [string, string];
  /**
   * Для sort: термины для распределения (12–20 штук, конкретные
   * понятия темы, а не «Понятие 1»).
   */
  items?: string[];
  /**
   * Для checklist: какие пункты верные (длина равна options).
   * true — пункт надо отметить ✓.
   */
  correctFlags?: boolean[];
  /**
   * Строки таблицы для table_fix: первая строка — заголовки
   * («Что сделано неправильно?» / «Как исправить?»), остальные —
   * пустые строки для заполнения учеником. Длина ≥ 2.
   */
  tableHeaders?: [string, string];
  /** Сколько пустых строк дать в таблице table_fix. */
  tableRows?: number;
  /**
   * Текст сценария для scenario_fix (печатается на цветном
   * «облаке»-подложке справа/сверху). Ошибки ученик разбирает
   * в строках «Ошибка N / Исправление».
   */
  situation?: string;
  /** Сколько ошибок найти в scenario_fix. */
  errorsCount?: number;
  /**
   * Варианты-кнопки для choice_buttons (напр. ["№1", "№2", "№3"]).
   * Печатаются залитыми прямоугольниками с чекбоксом.
   */
  choices?: string[];
  /** Правильный вариант для choice_buttons (эталон учителю). */
  correctChoice?: number;
  /**
   * Ссылка на интерактив (Wordwall, LearningApps и т.п.) для type=interactive.
   * Печатается под QR-рамкой: «Отсканируй QR или перейди по ссылке».
   * AI обязан возвращать null (учитель вставит свою ссылку), поэтому null допустим.
   */
  link?: string | null;
  /**
   * Варианты рефлексии для reflection:
   * тексты под смайликами (напр. ["Всё понял", "Сомневаюсь", "Нужна помощь"]).
   */
  reflectionOptions?: string[];
  /**
   * Служебная пометка учителю (печатается в блоке дескрипторов,
   * напр. «ФО», «Взаимооценивание», «Общий балл ___ из 10»).
   */
  teacherNote?: string;
  /**
   * Base64 JPEG (без префикса data:) — AI-иллюстрация задания (карточка).
   * Генерируется через Cloudflare FLUX.1 при withImages; без ключа поле отсутствует.
   */
  imageBase64?: string;
  imageMime?: "image/jpeg" | "image/png";
  imageAlt?: string;
  /** Промпт для генерации картинки на английском (создается AI для визуальных заданий) */
  imagePromptEn?: string | null;
  /** Уровень сложности задания. */
  difficulty?: DifficultyLevel;
  /** Для word_search: слова для поиска в сетке. */
  searchWords?: string[];
  /** Для word_search: сетка букв (сгенерируется автоматически). */
  letterGrid?: string[][];
  /** Для ordering: элементы для упорядочивания. */
  orderItems?: string[];
  /** Для ordering: правильный порядок (индексы). */
  correctOrder?: number[];
  /** Для odd_one_out: набор элементов, один из которых лишний. */
  oddItems?: string[];
  /** Для odd_one_out: индекс лишнего элемента. */
  oddIndex?: number;
  /** Для odd_one_out: объяснение, почему этот элемент лишний. */
  oddReason?: string;
  /** Для categorize: названия категорий. */
  categories?: string[];
  /** Для categorize: элементы для классификации. */
  categoryItems?: string[];
  /** Для categorize: правильная классификация (элемент → категория). */
  /** Разбивка по категориям: строки вида «категория: элемент». */
  categoryAnswer?: string[];
}

export interface Worksheet {
  kind: "worksheet";
  /** Язык содержимого и служебных подписей в печатной версии. */
  language?: "ru" | "kz";
  title: string;
  intro: string;
  /** Имя ученика / класс / дата — заголовочная строка. */
  metaLine: string;
  tasks: WorksheetTask[];
  /** Название листа + данные ученика (шапка для печати). */
  studentLine?: string;
  /** Дескрипторы учителю: печатаются отдельным блоком после заданий. */
  teacherDescriptors?: string;
  /** Рефлексия: текст-подсказка (напр. «Оцени свою работу: выбери смайлик»). */
  reflectionText?: string;
  /** Демо-заглушка без AI-ключей. */
  stub?: boolean;
  /**
   * AI был недоступен (503/429/пустой ответ), и лист собран локальным
   * методическим конструктором. Содержимое пригодно к печати, но формулировки
   * нужно проверить и дополнить — интерфейс обязан предупредить об этом.
   */
  degraded?: boolean;
  /**
   * Режим карточек: каждое задание печатается как карточка с рамкой и
   * (при withImages) AI-иллюстрацией. Иначе — обычный линейный лист.
   */
  cardLayout?: boolean;
  /** Картинки запрашивали, но провайдер их не вернул — пометка печатается в .docx. */
  imagesFailed?: boolean;
  /**
   * Цели обучения, по которым сгенерирован лист (для отображения в шапке).
   */
  learningObjectives?: string[];
}

export interface Flashcard {
  /** Короткий термин или вопрос на лицевой стороне карточки. */
  front: string;
  /** Объяснение, которое ученик запоминает после переворота карточки. */
  back: string;
  /** Конкретный пример из темы или повседневной жизни. */
  example?: string;
  /** Короткий вопрос для самопроверки после изучения карточки. */
  checkQuestion?: string;
  /**
   * Base64 (без префикса data:) — иллюстрация на лицевой стороне карточки.
   * Генерируется через Cloudflare FLUX.1 при withImages; без ключей поле отсутствует.
   */
  imageBase64?: string;
  imageMime?: "image/jpeg" | "image/png";
  /** Альт-текст к иллюстрации. */
  imageAlt?: string;
}

export interface FlashcardSet {
  kind: "flashcards";
  language?: "ru" | "kz";
  title: string;
  intro: string;
  cards: Flashcard[];
  /** Демо-заглушка без AI-ключей. */
  stub?: boolean;
  /**
   * Честная пометка: картинки запрашивали, но провайдер их не вернул
   * (например, недоступен). Показывается в .docx, чтобы пустые карточки
   * не выглядели как норма.
   */
  imagesFailed?: boolean;
}

export interface CrosswordWord {
  word: string; // ВЕРХНИЙ регистр; без пробелов и дефисов
  clue: string;
}

export interface Crossword {
  kind: "crossword";
  language?: "ru" | "kz";
  title: string;
  intro: string;
  /** Сетка после раскладки (заполненные ячейки = буква, пустые = null). */
  grid: (string | null)[][];
  /** Индексы по сетке: ячейки, в которых начинается слово, получают номер. */
  numbers: { row: number; col: number; number: number }[];
  /** Слова с координатами и направлением + номером. */
  placed: Array<{
    number: number;
    direction: "across" | "down";
    row: number;
    col: number;
    word: string;
    clue: string;
  }>;
  /** Слова, которые AI вернул, но не удалось разместить (показываем подсказки отдельно). */
  unplaced: CrosswordWord[];
  /** Демо-заглушка без AI-ключей. */
  stub?: boolean;
  /** Размер сетки (для настраиваемых кроссвордов). */
  gridSize?: number;
  /** Ключ решения: сетка с заполненными буквами. */
  solution?: string[][];
}

export type Handout = Worksheet | FlashcardSet | Crossword;

export interface HandoutInput {
  kind: HandoutKind;
  topic: string;
  subject: string;
  grade: number;
  language: "ru" | "kz";
  count: number; // для worksheet — 3–10 заданий; flashcards — кол-во карточек; crossword — кол-во слов
  /**
   * Для flashcards: добавить ИИ-иллюстрации на лицевую сторону каждой карточки
   * (требует ключей провайдера изображений). По умолчанию false.
   */
  withImages?: boolean;
  /**
   * Для worksheet: генерировать изображения для заданий (альтернативный флаг к withImages).
   * При наличии любого из флагов (withImages или generateImages) включается генерация.
   */
  generateImages?: boolean;
  /**
   * Для worksheet: карточный режим — задания как карточки с AI-иллюстрацией
   * и полем ответа. Ключи изображений те же, что у flashcards.
   */
  cardLayout?: boolean;
  /**
   * Свои слова для кроссворда (вместо AI-подбора): [{word, clue}].
   * Учитель вводит сам; сервер только нормализует и раскладывает сетку.
   */
  customWords?: Array<{ word: string; clue: string }>;
  /**
   * Резервирование слотов квоты под этот вызов (передаётся API-роутом).
   *
   * `generation` — слот за текстовую генерацию, `image` — слот за картинку.
   * Без этого раздаточные материалы обходили бы тариф: rate-limit не является
   * квотой, а каждый вызов стоит денег на стороне провайдера.
   */
  quota?: {
    reserve(kind: "generation" | "image"): Promise<{ ok: boolean; finalize?(success: boolean): Promise<void> }>;
  };
  /**
   * Контекст из КСП для привязки рабочего листа к уроку.
   */
  kspContext?: {
    learningObjectives: string[];
    assessmentCriteria: string[];
    stages: { stage: string; activities: string }[];
  };
  /**
   * Уровень сложности заданий.
   */
  difficulty?: DifficultyLevel;
  /**
   * Название школы для шапки документа.
   */
  schoolName?: string;
  /**
   * Имя учителя для шапки документа.
   */
  teacherName?: string;
  /**
   * Пользовательские инструкции для рабочего листа.
   */
  customInstructions?: string;
}
