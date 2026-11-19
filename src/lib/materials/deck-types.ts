import { z } from "zod";

export const DECK_THEMES = ["network", "lavender", "ocean", "sunset"] as const;
export type DeckTheme = (typeof DECK_THEMES)[number];

export const SLIDE_KINDS = ["title", "mood", "review", "guess", "goals", "infographic", "flow", "list", "cards", "question", "quiz", "groups", "activity", "assessment", "reflection", "homework", "thanks"] as const;
export type SlideKind = (typeof SLIDE_KINDS)[number];

const line = z.string().trim().min(1).max(400);
const lines = (max: number) => z.array(line).max(max).default([]);

export const deckSlideSchema = z.object({
  id: z.string().trim().min(1).max(40),
  kind: z.enum(SLIDE_KINDS),
  title: z.string().trim().min(1).max(200),
  lead: z.string().trim().max(400).default(""),
  /** Большие блоки схемы (flow): данные → обработка → результат. */
  steps: lines(4),
  /** Пункты, карточки или фразы настроя. */
  points: lines(8),
  /** Итоговая плашка внизу: «СКРЫТЫЙ СЛОЙ = ОБРАБОТКА ДАННЫХ». */
  takeaway: z.string().trim().max(160).default(""),
  options: lines(4),
  correctIndex: z.coerce.number().int().min(0).max(3).nullable().default(null),
  /** Что говорит учитель: уходит в заметки докладчика. */
  notes: z.string().trim().max(2000).default(""),
  /** Английское описание картинки без текста. Пусто, если картинка не нужна. */
  imagePrompt: z.string().trim().max(600).default(""),
  /** Сгенерированная иллюстрация в конструкторе (data:image/...), переиспользуется в предпросмотре и PPTX. */
  imageDataUri: z
    .string()
    .max(4_000_000)
    .refine((v) => v === "" || /^data:image\/(?:png|jpeg|jpg|webp|svg\+xml);/i.test(v), "Invalid image data URI")
    .optional()
    .default(""),
});
export type DeckSlide = z.infer<typeof deckSlideSchema>;

export const deckSlidesSchema = z.array(deckSlideSchema).min(1).max(30);

export const SLIDE_KIND_LABELS: Record<SlideKind, string> = {
  title: "Титульный",
  mood: "Настрой на урок",
  review: "Повторение",
  guess: "Определи тему",
  goals: "Цели урока",
  infographic: "Инфографика: понятие и ветви",
  flow: "Схема-конвейер",
  list: "Тезис и пункты",
  cards: "Карточки",
  question: "Вопрос классу",
  quiz: "Тест с ответом по клику",
  groups: "Групповая работа",
  activity: "Работа учеников",
  assessment: "Оценивание",
  reflection: "Рефлексия",
  homework: "Домашнее задание",
  thanks: "Завершение",
};

export const SLIDE_KIND_LABELS_KK: Record<SlideKind, string> = {
  title: "Титулдық слайд",
  mood: "Сабаққа психологиялық ахуал",
  review: "Қайталау",
  guess: "Тақырыпты анықта",
  goals: "Сабақ мақсаттары",
  infographic: "Инфографика: ұғым және тармақтар",
  flow: "Схема-конвейер",
  list: "Тезис және тармақтар",
  cards: "Карточкалар",
  question: "Сыныпқа сұрақ",
  quiz: "Жауабы басу арқылы ашылатын тест",
  groups: "Топтық жұмыс",
  activity: "Оқушылардың жұмысы",
  assessment: "Бағалау",
  reflection: "Рефлексия",
  homework: "Үй тапсырмасы",
  thanks: "Қорытынды",
};

export function slideKindLabel(kind: SlideKind, locale: "ru" | "kk" = "ru"): string {
  return locale === "kk" ? SLIDE_KIND_LABELS_KK[kind] : SLIDE_KIND_LABELS[kind];
}

/** Какие поля нужны макету: конструктор показывает только их. */
export const SLIDE_FIELDS: Record<SlideKind, Array<"lead" | "steps" | "points" | "takeaway" | "options" | "imagePrompt">> = {
  title: ["lead", "imagePrompt"],
  mood: ["points", "imagePrompt"],
  review: ["points", "imagePrompt"],
  guess: ["points", "imagePrompt"],
  goals: ["points"],
  infographic: ["lead", "points", "takeaway"],
  flow: ["lead", "steps", "points", "takeaway"],
  list: ["points", "takeaway", "imagePrompt"],
  cards: ["points", "takeaway"],
  question: ["points"],
  quiz: ["options"],
  groups: ["lead", "points"],
  activity: ["lead", "points"],
  assessment: ["points"],
  reflection: ["points"],
  homework: ["points"],
  thanks: ["lead"],
};

export interface DeckPalette {
  ink: string;
  muted: string;
  net: string;
  accent: string;
  band: string;
  soft: string;
  tones: string[];
}

export const DECK_PALETTES: Record<DeckTheme, DeckPalette> = {
  network: { ink: "1f2433", muted: "5a6072", net: "e4e6ec", accent: "4f5fa3", band: "4f5fa3", soft: "eef0f7", tones: ["7cc4b4", "5a68a8", "f4a64b", "b7a6e6", "e88a9a", "6bb3e0"] },
  lavender: { ink: "1e1a3c", muted: "5f5a80", net: "ece7fb", accent: "6d3bea", band: "6d3bea", soft: "efe8ff", tones: ["8b6cf0", "5aa9f2", "f08fc0", "53c2a5", "f4b04f", "9d7ae8"] },
  ocean: { ink: "0f2a3a", muted: "4c6573", net: "dcedf3", accent: "0c7fa8", band: "0c7fa8", soft: "e3f4f9", tones: ["16a3b8", "2f6fe4", "37c29a", "f2a33c", "5b7ee8", "2dbbd0"] },
  sunset: { ink: "3a1d20", muted: "7a5a55", net: "f8e4da", accent: "d6532f", band: "d6532f", soft: "fff0e6", tones: ["f07a3c", "e04f7a", "f4b13d", "a25fd1", "e8665a", "f2954a"] },
};

export interface InfographicBranch {
  icon: string;
  head: string;
  caption: string;
}

const LEADING_EMOJI = /^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)\s*/u;

/**
 * Ветвь инфографики хранится строкой «🌡️ Числовая форма: Числа, температура»:
 * значок, заголовок плашки и подпись. Отдельных полей нет, чтобы черновики и
 * конструктор работали со старым форматом слайда.
 */
export function parseBranch(point: string): InfographicBranch {
  const emoji = point.match(LEADING_EMOJI);
  const rest = emoji ? point.slice(emoji[0].length) : point;
  const split = rest.search(/\s*[:—–]\s+/);
  if (split < 0) return { icon: emoji?.[1] ?? "", head: rest.trim(), caption: "" };
  const separator = rest.slice(split).match(/^\s*[:—–]\s+/)![0];
  return { icon: emoji?.[1] ?? "", head: rest.slice(0, split).trim(), caption: rest.slice(split + separator.length).trim() };
}

/** Заголовок-тезис как на слайдах учителя: часть после тире выделяется цветом. */
export function splitThesis(title: string): [string, string] {
  const at = title.indexOf(" — ");
  return at > 0 ? [title.slice(0, at + 3), title.slice(at + 3)] : [title, ""];
}

/** Баллы из конца дескриптора: «… — 2 балла», «(1 б.)». */
export function descriptorPoints(text: string): { text: string; points: number | null } {
  const match = text.match(/\s*[—–(-]?\s*(\d+)\s*(?:балл\S*|б\.?|ұпай)\)?\s*$/i);
  return match ? { text: text.slice(0, match.index).trim(), points: Number(match[1]) } : { text: text.trim(), points: null };
}
