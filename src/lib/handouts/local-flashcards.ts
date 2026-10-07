/**
 * Локальные конструкторы памяток и кроссворда — последний рубеж перед 500.
 *
 * Зачем это отдельным модулем, а не двумя функциями в generate.ts:
 *
 *  * отказ AI для карточек и кроссворда заканчивался 500. Учитель, у которого
 *    в момент нажатия провайдер был недоступен, терял материал целиком —
 *    тогда как для рабочего листа degraded-режим уже был;
 *  * содержимое в degraded-режиме должно быть настоящим, а не пустым. Раньше
 *    единственным источником слов был сам AI, поэтому надёжного варианта не
 *    существовало.
 *
 * Источник слов здесь один — тема урока и цели урока из КСП. Это реальные
 * данные конкретного урока, а не выдумка: кроссворд собирается и печатается,
 * карточки заполняются, учителю остаётся их уточнить.
 */

import { layoutCrossword } from "./crossword";
import type { Crossword, CrosswordWord, Flashcard, FlashcardSet, HandoutInput } from "./types";

/** Слова из текста: кириллица и латиница, длина от 3 букв. */
const WORD_RE = /[\p{Script=Cyrillic}\p{Script=Latin}]{3,}/gu;

const STOP = new Set([
  // Русские служебные слова, которые не годятся в качестве слова кроссворда.
  "это", "как", "для", "что", "где", "кто", "при", "под", "над", "без", "или",
  "так", "уже", "ещё", "еще", "быть", "весь", "вся", "все", "если", "тот",
  "эта", "эти", "того", "этом", "свой", "своя", "который", "которая",
  // Казахские служебные слова.
  "бұл", "ол", "және", "немесе", "үшін", "туралы", "бойынша", "соң",
  "кейін", "алдын", "барлық", "әр", "көп", "аз", "сол", "осы", "оның",
]);

const COPY = {
  ru: {
    memo: "ПАМЯТКА",
    title: (topic: string) => `Памятки по теме «${topic}»`,
    intro: (topic: string, grade: number) =>
      `Карточки по теме «${topic}», ${grade} класс. На одной стороне — термин, на другой — объяснение с примером. Проверьте себя по оборотам.`,
    back: (term: string, topic: string) =>
      `Термин «${term}» из темы «${topic}». Уточните формулировку своими словами по учебнику.`,
    example: (term: string, topic: string) =>
      `Приведите свой пример использования «${term}» в задачах по теме «${topic}».`,
    check: (term: string) => `Объясните своими словами, что такое «${term}», и приведите пример.`,
    note: (topic: string) =>
      `Комплект собран без ИИ: термины взяты из темы «${topic}», объяснения требуют вашего уточнения по учебнику.`,
    crosswordTitle: (topic: string) => `Кроссворд: ${topic}`,
    crosswordIntro: (topic: string) => `Разгадайте слова по подсказкам. Тема: «${topic}».`,
    clue: (term: string, topic: string) => `Слово по теме «${topic}» (${term.length} букв)`,
    crosswordNote: (topic: string) =>
      `Слова взяты из темы «${topic}» и целей урока. Замените их на термины из учебника, если это нужно.`,
  },
  kz: {
    memo: "ЖАДТАРМА",
    title: (topic: string) => `«${topic}» тақырыбы бойынша жадтармалар`,
    intro: (topic: string, grade: number) =>
      `«${topic}» тақырыбына жаттармалар, ${grade}-сынып. Бір жағында термин, екіншісінде түсіндірме. Артқы жағындағы жауаптармен тексеріңіз.`,
    back: (term: string, topic: string) =>
      `«${topic}» тақырыбынан алынған термин «${term}». Оны оқулық бойынша өз сөзіңізбен нақтылаңыз.`,
    example: (term: string) => `«${term}» қолданылуына өз мысалыңызды келтіріңіз.`,
    check: (term: string) => `«${term}» дегеніміз не — өз сөзіңізбен түсіндіріп, мысал келтіріңіз.`,
    note: (topic: string) =>
      `Жинақ ЖИ-сыз жасалды: терминдер «${topic}» тақырыбынан алынған, түсіндірмелерді оқулық бойынша нақтылаңыз.`,
    crosswordTitle: (topic: string) => `Сөзжұмбақ: ${topic}`,
    crosswordIntro: (topic: string) => `Анықтамалар бойынша сөздерді табыңыз. Тақырып: «${topic}».`,
    clue: (term: string, topic: string) => `«${topic}» тақырыбынан сөз (${term.length} әріп)`,
    crosswordNote: (topic: string) =>
      `Сөздер «${topic}» тақырыбы мен сабақ мақсаттарынан алынған. Қажет болса, оқулықтағы терминдермен алмастырыңыз.`,
  },
} as const;

/**
 * Ключевые слова из текста темы и целей урока.
 *
 * Порядок сохраняется: первыми идут слова из целей урока (они точно по теме),
 * затем из названия темы. Длина ограничена 12 буквами — более длинные слова
 * не помещались в сетку и раньше молча выпадали из задания.
 */
function topicWords(input: HandoutInput, limit: number): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  const sources = [
    ...(input.kspContext?.learningObjectives ?? []),
    input.topic,
    input.subject ?? "",
  ];
  for (const source of sources) {
    for (const raw of String(source).toUpperCase().match(WORD_RE) ?? []) {
      const word = raw.replace(/[^А-ЯӘҒҚҢӨҰҮҺІЁA-Z]/g, "");
      if (word.length < 3 || word.length > 12) continue;
      if (STOP.has(word.toLowerCase())) continue;
      if (seen.has(word)) continue;
      seen.add(word);
      found.push(word);
      if (found.length >= limit) return found;
    }
  }
  return found;
}

/**
 * Карточки без AI.
 *
 * Содержание намеренно помечено как требующее уточнения: карточка создана
 * по терминам темы, но формулировка объяснения остаётся за учителем. Это
 * честнее, чем выдумать определение, которое может оказаться неверным.
 */
export function buildLocalFlashcards(input: HandoutInput): FlashcardSet {
  const copy = COPY[input.language === "kz" ? "kz" : "ru"];
  const wanted = Math.max(4, Math.min(20, input.count));
  const found = topicWords(input, wanted);

  // Если из темы удалось выделить меньше четырёх слов, комплект всё равно
  // собирается: добавляем пронумерованные заготовки по теме, чтобы карточки
  // были и их можно было заполнить от руки.
  const fallback = found.length < 4;
  const terms = [...found];
  while (terms.length < wanted) {
    terms.push(`${input.topic} ${terms.length + 1}`);
  }

  const cards: Flashcard[] = terms.slice(0, wanted).map((term) => ({
    front: term,
    back: copy.back(term, input.topic),
    example: copy.example(term, input.topic),
    checkQuestion: copy.check(term),
  }));

  return {
    kind: "flashcards",
    language: input.language,
    title: copy.title(input.topic),
    intro: `${copy.intro(input.topic, input.grade ?? 0)}${fallback ? `\n${copy.note(input.topic)}` : ""}`,
    cards,
    degraded: true,
  };
}

/**
 * Кроссворд без AI.
 *
 * Если слов из темы меньше трёх, материал невозможно собрать: кроссворд из
 * двух слов не имеет смысла. В этом случае возвращается пустая сетка, и
 * вызывающий код сообщает об этом понятной ошибкой, а не отдаёт учителю
 * пустой документ с заголовком.
 */
export function buildLocalCrossword(input: HandoutInput): Crossword {
  const copy = COPY[input.language === "kz" ? "kz" : "ru"];
  const wanted = Math.max(3, Math.min(20, input.count));
  const terms = topicWords(input, wanted);
  const words: CrosswordWord[] = terms.map((term) => ({
    word: term,
    clue: copy.clue(term, input.topic),
  }));
  const laid = layoutCrossword(words, copy.crosswordTitle(input.topic), copy.crosswordIntro(input.topic));
  return {
    ...laid,
    language: input.language,
    intro: `${laid.intro}\n${copy.crosswordNote(input.topic)}`,
    // Помечается здесь, а не в вызывающем коде: любой путь к сборке без AI
    // обязан нести признак, иначе интерфейс покажет кроссворд как готовый.
    degraded: true,
  };
}
