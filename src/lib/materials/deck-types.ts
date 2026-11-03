import { z } from "zod";

export const DECK_THEMES = ["network", "lavender", "ocean", "sunset"] as const;
export type DeckTheme = (typeof DECK_THEMES)[number];

export const SLIDE_KINDS = ["title", "mood", "guess", "goals", "flow", "list", "cards", "question", "quiz", "activity", "reflection", "homework", "thanks"] as const;
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
});
export type DeckSlide = z.infer<typeof deckSlideSchema>;

export const deckSlidesSchema = z.array(deckSlideSchema).min(1).max(30);

export const SLIDE_KIND_LABELS: Record<SlideKind, string> = {
  title: "Титульный",
  mood: "Настрой на урок",
  guess: "Определи тему",
  goals: "Цели урока",
  flow: "Схема-конвейер",
  list: "Тезис и пункты",
  cards: "Карточки",
  question: "Вопрос классу",
  quiz: "Тест с ответом по клику",
  activity: "Работа учеников",
  reflection: "Рефлексия",
  homework: "Домашнее задание",
  thanks: "Завершение",
};

/** Какие поля нужны макету: конструктор показывает только их. */
export const SLIDE_FIELDS: Record<SlideKind, Array<"lead" | "steps" | "points" | "takeaway" | "options" | "imagePrompt">> = {
  title: ["lead", "imagePrompt"],
  mood: ["points", "imagePrompt"],
  guess: ["points", "imagePrompt"],
  goals: ["points"],
  flow: ["lead", "steps", "points", "takeaway"],
  list: ["points", "takeaway", "imagePrompt"],
  cards: ["points", "takeaway"],
  question: ["points"],
  quiz: ["options"],
  activity: ["lead", "points"],
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
