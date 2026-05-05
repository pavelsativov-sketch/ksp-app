/**
 * Extract plain text from a .docx file (zip with word/document.xml).
 *
 * Pure-JS implementation using JSZip — works on Cloudflare Workers
 * (no native deps). Returns paragraph-per-line plain text.
 *
 * We keep paragraph order, drop everything that isn't a `w:t` (text run)
 * or paragraph break. Tables are flattened — each cell becomes its own
 * line. This is good enough for the AI structuring step that follows.
 */
import JSZip from "jszip";

export async function docxToText(file: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(file);
  const documentXmlFile = zip.file("word/document.xml");
  if (!documentXmlFile) {
    throw new Error("Файл не похож на .docx — внутри нет word/document.xml");
  }
  const xml = await documentXmlFile.async("string");

  // Parse paragraph-by-paragraph. We split on paragraph boundaries first to
  // preserve line structure, then strip everything that isn't a text run.
  const paragraphs = xml
    .split(/<w:p[\s>]/)
    .slice(1)
    .map((chunk) => extractParagraphText(chunk))
    .filter((line) => line.length > 0);

  return paragraphs.join("\n");
}

function extractParagraphText(paragraphChunk: string): string {
  // Stop at the closing </w:p>.
  const end = paragraphChunk.indexOf("</w:p>");
  const body = end >= 0 ? paragraphChunk.slice(0, end) : paragraphChunk;

  // Pull out every <w:t ...>TEXT</w:t> run.
  const runs: string[] = [];
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    runs.push(decodeXmlEntities(m[1]));
  }

  // Tabs become spaces; soft breaks become spaces too.
  const text = runs.join("").replace(/\s+/g, " ").trim();
  return text;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#xA0;/gi, "\u00A0")
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}
