/**
 * Разбиение текста учебника на чанки фиксированного размера с перекрытием.
 * Чанк: ~700 символов, перекрытие 100. Хорошо ложится в `text-embedding-3-small` (8k токенов лимит).
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
}

export function chunkPages(pages: RawPage[]): Chunk[] {
  const out: Chunk[] = [];
  let counter = 0;

  for (const page of pages) {
    const text = normalize(page.text);
    if (text.length === 0) continue;
    // If the page is short, don't split it.
    if (text.length <= TARGET_SIZE + 200) {
      out.push({ index: counter++, pageNumber: page.pageNumber, content: text });
      continue;
    }
    // Split by paragraphs first, then pack into TARGET_SIZE chunks with sentence boundaries.
    const paragraphs = text.split(/\n{2,}/g);
    let buffer = "";
    for (const para of paragraphs) {
      if (buffer.length + para.length + 2 <= TARGET_SIZE) {
        buffer = buffer ? `${buffer}\n\n${para}` : para;
      } else {
        if (buffer) {
          out.push({ index: counter++, pageNumber: page.pageNumber, content: buffer });
          // overlap: keep tail of buffer
          buffer = tail(buffer, OVERLAP);
        }
        // If a single paragraph is bigger than TARGET_SIZE, split it by sentences.
        if (para.length > TARGET_SIZE) {
          const sentences = para.split(/(?<=[.!?])\s+/);
          for (const s of sentences) {
            if (buffer.length + s.length + 1 > TARGET_SIZE) {
              if (buffer.trim()) {
                out.push({ index: counter++, pageNumber: page.pageNumber, content: buffer.trim() });
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
      out.push({ index: counter++, pageNumber: page.pageNumber, content: buffer.trim() });
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
