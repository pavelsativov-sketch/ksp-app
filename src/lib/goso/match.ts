import { localObjectives, localSubjects, type LocalObjective } from "./local";

const MIN_WORD = 4;
const STEM_LENGTH = 5;

/** Приблизительный корень слова: окончания в русском разные, общий корень — первые буквы. */
function stems(text: string): string[] {
  const words = text.toLowerCase().match(/[a-zа-яё]+/g) ?? [];
  return [...new Set(words.filter((w) => w.length >= MIN_WORD).map((w) => w.slice(0, STEM_LENGTH)))];
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

  const scored = localObjectives({ subject, grade: opts.grade, limit: 5000 }).map((o: LocalObjective) => {
    const body = new Set(stems(o.text_ru));
    const section = new Set(stems(o.section ?? ""));
    const score = topicStems.reduce((sum, s) => sum + (body.has(s) ? 2 : 0) + (section.has(s) ? 1 : 0), 0);
    return { o, score };
  });

  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.o.code.localeCompare(b.o.code, "ru", { numeric: true }))
    .slice(0, opts.limit ?? 3)
    .map(({ o }) => ({ code: o.code, text: o.text_ru }));
}
