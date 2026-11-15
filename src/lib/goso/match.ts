import { localObjectives, localSubjects, type LocalObjective } from "./local";

const MIN_WORD = 4;
const STEM_LENGTH = 5;
const SHORT_STEM_LENGTH = 4;

/** Приблизительный корень слова: окончания в русском разные, общий корень — первые буквы. */
function stems(text: string, length = STEM_LENGTH): string[] {
  const words = text.toLowerCase().match(/[a-zа-яё]+/g) ?? [];
  return [...new Set(words.filter((w) => w.length >= MIN_WORD).map((w) => w.slice(0, length)))];
}

/** Название предмета как в ГОСО: ищем без учёта регистра, лишнее не угадываем. */
export function resolveGosoSubject(subject: string): string | null {
  const wanted = subject.trim().toLowerCase();
  return localSubjects().find((s) => s.name_ru.toLowerCase() === wanted)?.name_ru ?? null;
}

export interface MatchedObjective {
  code: string;
  text: string;
}

/**
 * Подбирает цели обучения ГОСО под тему урока по совпадению корней слов.
 * Возвращает только реальные цели; если совпадений нет, пустой список:
 * лучше отсутствие привязки, чем выдуманная.
 */
export function matchObjectives(opts: { subject: string; grade: number; topic: string; limit?: number }): MatchedObjective[] {
  const subject = resolveGosoSubject(opts.subject);
  if (!subject) return [];
  const topicStems = stems(opts.topic);
  if (topicStems.length === 0) return [];
  const topicShort = stems(opts.topic, SHORT_STEM_LENGTH);

  const pool = localObjectives({ subject, grade: opts.grade, limit: 5000 }).map((o: LocalObjective) => ({
    o,
    body: new Set(stems(o.text_ru)),
    short: new Set(stems(o.text_ru, SHORT_STEM_LENGTH)),
  }));
  // Вес слова по редкости: «строение» есть в десятках целей и не должно перевешивать «клетку».
  const weight = (key: "body" | "short", stem: string) =>
    Math.log((pool.length + 1) / (pool.filter((item) => item[key].has(stem)).length + 1)) + 0.1;
  // Полный корень обязателен; короткий («раст» у «растения» и «растительную») только добавляет вес,
  // иначе «Орда» находила бы «Ордабасы».
  const scored = pool.map(({ o, body, short }) => {
    const full = topicStems.filter((s) => body.has(s));
    const partial = topicShort.filter((s) => short.has(s) && !full.some((f) => f.startsWith(s)));
    return {
      o,
      score: full.length === 0 ? 0 : full.reduce((sum, s) => sum + 2 * weight("body", s), 0) + partial.reduce((sum, s) => sum + weight("short", s), 0),
    };
  });

  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.o.code.localeCompare(b.o.code, "ru", { numeric: true }))
    .slice(0, opts.limit ?? 3)
    .map(({ o }) => ({ code: o.code, text: o.text_ru }));
}

/** Цели одной темы КТП строками «код — текст». */
export function objectivesForTopic(subject: string, grade: number, topic: string): string {
  return matchObjectives({ subject, grade, topic, limit: 2 }).map((o) => `${o.code} — ${o.text}`).join("\n");
}
