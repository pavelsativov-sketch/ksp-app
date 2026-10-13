/**
 * Структурно-осведомлённое разбиение текста учебника на чанки с перекрытием.
 *
 * Особенности:
 * - Короткие страницы (до TARGET_SIZE + 200 = 900 символов) сохраняются целиком.
 * - В длинных страницах распознаются структурные границы учебников РК (рус/каз):
 *   параграфы (`§`, `Параграф`, `Тақырып`, `Бөлім`), упражнения и задания
 *   (`Упражнение`, `Задание`, `Задача`, `Жаттығу`, `Тапсырма`, `Есеп`, `№`),
 *   определения (`Определение`, `Правило`, `Анықтама`, `Ереже`) и таблицы (`Таблица`, `Кесте`).
 * - Короткий заголовок параграфа или номер задания никогда не отрывается от своего тела
 *   в конец предыдущего чанка.
 */

const TARGET_SIZE = 700;
const OVERLAP = 100;

export interface RawPage {
  pageNumber: number;
  text: string;
}

export interface Chunk {
  index: number;
  pageNumber: number;
  content: string;
  sectionTitle?: string;
}

/**
 * Распознаёт начало структурного блока учебника (параграф, задание, упражнение, правило, таблица).
 */
const STRUCTURAL_LINE_RE =
  /^(?:§\s*\d+|параграф\s+\d+|глава\s+\d+|раздел\s+\d+|\d+\s*-?\s*(?:бөлім|тақырып|параграф|тапсырма|жаттығу|есеп)\b|(?:тақырып|бөлім|упражнение|упр\.|задание|задача|жаттығу|тапсырма|есеп|определение|правило|теорема|анықтама|ереже|таблица|кесте|вопросы и задания|сұрақтар мен тапсырмалар|практическая работа|лабораторная работа|зертханалық жұмыс|практикалық жұмыс)\b|№\s*\d+)/i;

const SECTION_HEADING_RE =
  /^(?:§\s*\d+[^\n]*|(?:параграф|тақырып|бөлім|раздел|глава)\s+\d+[^\n]*|\d+\s*-?\s*(?:бөлім|тақырып)[^\n]*)/i;

function isStandaloneHeading(block: string): boolean {
  const trimmed = block.trim();
  if (!trimmed || trimmed.length > 110 || trimmed.includes("\n")) return false;
  return STRUCTURAL_LINE_RE.test(trimmed);
}

/**
 * Делит страницу на логические абзацы, учитывая как двойные переводы строк `\n\n`,
 * так и одиночные переводы строк перед структурными маркерами (`§`, `Задание`, `Тапсырма` и т.д.),
 * и склеивает короткие заголовки со следующим за ними абзацем, чтобы заголовок не отрывался от текста.
 */
export function splitIntoStructuralParagraphs(text: string): string[] {
  const rawBlocks = text.split(/\n{2,}/g);
  const refined: string[] = [];

  for (const block of rawBlocks) {
    if (!block.includes("\n")) {
      refined.push(block);
      continue;
    }
    const lines = block.split("\n");
    let current = "";
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (current && STRUCTURAL_LINE_RE.test(trimmedLine) && !isStandaloneHeading(current)) {
        refined.push(current);
        current = line;
      } else {
        current = current ? `${current}\n${line}` : line;
      }
    }
    if (current) refined.push(current);
  }

  // Прикрепляем короткие заголовки/номера заданий к следующему абзацу,
  // чтобы заголовок не оставался сиротой в конце предыдущего чанка.
  const merged: string[] = [];
  for (let i = 0; i < refined.length; i++) {
    const cur = refined[i]!;
    if (
      isStandaloneHeading(cur) &&
      i + 1 < refined.length &&
      cur.length + 1 + refined[i + 1]!.length <= TARGET_SIZE
    ) {
      merged.push(`${cur}\n${refined[i + 1]!}`);
      i++;
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

export function chunkPages(pages: RawPage[]): Chunk[] {
  const out: Chunk[] = [];
  let counter = 0;
  let activeSection: string | undefined;

  for (const page of pages) {
    const text = normalize(page.text);
    if (text.length === 0) continue;

    const firstHeadingMatch = text.match(SECTION_HEADING_RE);
    if (firstHeadingMatch?.[0]) {
      activeSection = firstHeadingMatch[0].trim().slice(0, 120);
    }

    // If the page is short, don't split it.
    if (text.length <= TARGET_SIZE + 200) {
      const chunk: Chunk = { index: counter++, pageNumber: page.pageNumber, content: text };
      if (activeSection) chunk.sectionTitle = activeSection;
      out.push(chunk);
      continue;
    }

    // Split by structural paragraphs first, then pack into TARGET_SIZE chunks with sentence boundaries.
    const paragraphs = splitIntoStructuralParagraphs(text);
    let buffer = "";
    for (const para of paragraphs) {
      const headingInPara = para.match(SECTION_HEADING_RE);
      if (headingInPara?.[0]) {
        activeSection = headingInPara[0].trim().slice(0, 120);
      }

      if (buffer.length + para.length + 2 <= TARGET_SIZE) {
        buffer = buffer ? `${buffer}\n\n${para}` : para;
      } else {
        if (buffer) {
          const chunk: Chunk = { index: counter++, pageNumber: page.pageNumber, content: buffer };
          if (activeSection) chunk.sectionTitle = activeSection;
          out.push(chunk);
          // Если новый блок начинается с нового параграфа/задания — не тащим в него хвост старого абзаца,
          // если это приведёт к переполнению; для обычных абзацев сохраняем стандартное перекрытие OVERLAP.
          buffer = STRUCTURAL_LINE_RE.test(para.trim()) && para.length <= TARGET_SIZE
            ? ""
            : tail(buffer, OVERLAP);
        }
        // If a single paragraph is bigger than TARGET_SIZE, split it by sentences.
        if (para.length > TARGET_SIZE) {
          const sentences = para.split(/(?<=[.!?])\s+/);
          for (const s of sentences) {
            if (buffer.length + s.length + 1 > TARGET_SIZE) {
              if (buffer.trim()) {
                const chunk: Chunk = {
                  index: counter++,
                  pageNumber: page.pageNumber,
                  content: buffer.trim(),
                };
                if (activeSection) chunk.sectionTitle = activeSection;
                out.push(chunk);
                buffer = tail(buffer, OVERLAP);
              }
            }
            buffer = buffer ? `${buffer} ${s}` : s;
          }
        } else {
          buffer = buffer ? `${buffer}\n\n${para}` : para;
        }
      }
    }
    if (buffer.trim()) {
      const chunk: Chunk = {
        index: counter++,
        pageNumber: page.pageNumber,
        content: buffer.trim(),
      };
      if (activeSection) chunk.sectionTitle = activeSection;
      out.push(chunk);
    }
  }
  return out;
}

function normalize(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function tail(s: string, n: number): string {
  if (s.length <= n) return "";
  return s.slice(-n);
}
