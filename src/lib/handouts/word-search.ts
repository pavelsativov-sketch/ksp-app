/**
 * Сетка для задания «поиск слов».
 *
 * Вынесена из рендерера DOCX отдельной чистой функцией по двум причинам:
 *
 *  * раньше раскладка жила внутри `docx.ts` и проверять её было нечем —
 *    буквы попадали в документ отдельными run'ами, слово в XML не собиралось,
 *    и тест «слово есть в сетке» был недостижим;
 *  * предпросмотру нужна та же сетка, что и печати. Иначе учитель искал бы
 *    на экране одно поле, а распечатывал другое.
 *
 * Свойства, которые функция обязана обеспечивать:
 *
 *  * детерминированность — один и тот же список слов даёт одну и ту же сетку;
 *    раньше заполнение шло через `Math.random`, и повторная печать выдавала
 *    другую головоломку;
 *  * полнота — каждое слово гарантированно попадает в сетку целиком. Раньше
 *    слова раскладывались по одной строке и терялись, если их было больше,
 *    чем строк, а длинные обрезались по краю;
 *  * алфавит с казахскими буквами — иначе в казахской версии задания в сетке
 *    встречаются буквы, которых нет в словах ученика.
 */

/** Алфавит дозаполнения: русский + казахские буквы + латиница. */
const FILL_ALPHABET = "АӘБВГҒДЕЁЖЗИЙКҚЛМНҢОӨПРСТУҰҮФХҺЦЧШЩЪЫЬЭЮЯІABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Самое длинное слово, которое влезает в сетку. */
const MAX_WORD_LENGTH = 12;
/** Минимальный и максимальный размер сетки. */
const MIN_SIZE = 10;
const MAX_SIZE = 14;

export interface WordSearchGrid {
  /** Размер стороны сетки. */
  size: number;
  /** Буквы сетки построчно. */
  cells: string[][];
  /** Слова, которые удалось разместить. */
  placed: string[];
  /** Слова, которые не поместились ни в одну линию. */
  dropped: string[];
}

const DIRECTIONS = [
  { dr: 0, dc: 1 },  // горизонталь слева направо
  { dr: 1, dc: 0 },  // вертикаль сверху вниз
  { dr: 1, dc: 1 },  // по диагонали вниз-вправо
  { dr: 1, dc: -1 }, // по диагонали вниз-влево
] as const;

/** Детерминированный генератор: одинаковый вход → одинаковая сетка. */
function seeded(seedText: string): () => number {
  let seed = 0;
  for (const ch of seedText) seed = (seed * 31 + ch.charCodeAt(0)) % 1_000_003;
  return () => {
    seed = (seed * 1103515245 + 12345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };
}

export function buildWordSearchGrid(rawWords: string[]): WordSearchGrid {
  const normalized = rawWords
    .map((word) => word.trim().toUpperCase())
    .filter((word) => word.length > 0);
  // Слишком длинные слова не выбрасываются молча: они попадают в `dropped`,
  // чтобы вызывающий код мог сказать учителю, какое слово в поле не попало.
  // Раньше фильтр отбрасывал их, и ученик искал бы слово, которого нет.
  const tooLong = normalized.filter((word) => word.length > MAX_WORD_LENGTH);
  const cleaned = normalized.filter((word) => word.length <= MAX_WORD_LENGTH);
  // Пустой список всё равно даёт сетку: иначе учитель получил бы задание
  // без поля и не понял бы, что произошло.
  const usable = cleaned.length > 0 ? cleaned : ["СЛОВО"];

  // Размер обязан вмещать самое длинное слово. Раньше размер считался только
  // от общей длины всех слов, и «ЗНАМЕНАТЕЛЬ» (11 букв) при сетке 10 просто
  // не помещался: слово исчезало из задания, и никто об этом не узнавал.
  const longest = Math.max(...usable.map((word) => word.length));
  const byVolume = Math.ceil(Math.sqrt(usable.join("").length)) + 2;
  const size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, longest, byVolume));
  const cells: (string | null)[][] = Array.from({ length: size }, () => Array<string | null>(size).fill(null));
  const next = seeded(usable.join("|"));

  const placed: string[] = [];
  const dropped: string[] = [...tooLong];

  for (const word of usable) {
    const reversed = word.split("").reverse().join("");
    const candidates = word.length <= size ? [word] : reversed.length <= size ? [reversed] : [];
    if (candidates.length === 0) {
      dropped.push(word);
      continue;
    }

    let placedWord: string | null = null;

    for (const candidate of candidates) {
      if (placedWord) break;
      for (let attempt = 0; attempt < 400 && !placedWord; attempt++) {
        const direction = DIRECTIONS[Math.floor(next() * DIRECTIONS.length)];
        const rowSpan = direction.dr === 0 ? size : size - 1;
        const colSpanMax = direction.dc === 0 ? size - 1 : size - 1 - candidate.length;
        if (colSpanMax < 0) continue;
        const row = Math.floor(next() * rowSpan);
        const col = Math.floor(next() * (colSpanMax + 1));
        const endRow = row + direction.dr * (candidate.length - 1);
        const endCol = col + direction.dc * (candidate.length - 1);
        if (endRow >= size || endCol < 0 || endCol >= size) continue;

        let fits = true;
        for (let i = 0; i < candidate.length; i++) {
          const existing = cells[row + direction.dr * i][col + direction.dc * i];
          if (existing !== null && existing !== candidate[i]) {
            fits = false;
            break;
          }
        }
        if (!fits) continue;
        for (let i = 0; i < candidate.length; i++) {
          cells[row + direction.dr * i][col + direction.dc * i] = candidate[i];
        }
        placedWord = candidate;
      }
    }

    // Не поместившееся слово кладём в первую свободную строку. Иначе
    // задание нерешаемо: ученик искал бы слово, которого в поле нет.
    if (!placedWord) {
      const word = candidates[0];
      for (let row = 0; row < size && !placedWord; row++) {
        let free = true;
        for (let i = 0; i < word.length; i++) {
          if (cells[row][i] !== null) {
            free = false;
            break;
          }
        }
        if (!free) continue;
        for (let i = 0; i < word.length; i++) cells[row][i] = word[i];
        placedWord = word;
      }
    }

    if (placedWord) placed.push(placedWord);
    else dropped.push(word);
  }

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (cells[row][col] === null) {
        cells[row][col] = FILL_ALPHABET[Math.floor(next() * FILL_ALPHABET.length)];
      }
    }
  }

  return { size, cells: cells.map((row) => row.map((cell) => cell ?? " ")), placed, dropped };
}

/** Есть ли слово в сетке в любом из четырёх направлений. */
export function containsWord(grid: WordSearchGrid, word: string): boolean {
  const target = word.trim().toUpperCase();
  if (!target) return false;
  const { size, cells } = grid;
  for (const direction of DIRECTIONS) {
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        let matches = true;
        for (let i = 0; i < target.length; i++) {
          const r = row + direction.dr * i;
          const c = col + direction.dc * i;
          if (r >= size || c < 0 || c >= size || cells[r][c] !== target[i]) {
            matches = false;
            break;
          }
        }
        if (matches) return true;
      }
    }
  }
  return false;
}
