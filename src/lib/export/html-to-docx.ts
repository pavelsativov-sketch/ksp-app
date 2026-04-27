import { Paragraph, TextRun, ExternalHyperlink, ImageRun } from "docx";

/**
 * Convert a small subset of HTML (the output of TipTap RichTextEditor) into
 * docx Paragraphs. Used by the .docx exporter for stage actions.
 *
 * Supports: <p>, <br>, <strong>/<b>, <em>/<i>, <u>, <code>, <a href>,
 * <ul>/<ol>/<li>, <h2>/<h3>, <blockquote>, <img>.
 *
 * Falls back to simple paragraph splitting for legacy plain-text inputs.
 *
 * Two flavors:
 * - {@link htmlToDocxParagraphs}: synchronous; renders <img> as a grey italic
 *   placeholder "[фото: alt]". Use when callers cannot await fetches.
 * - {@link htmlToDocxParagraphsAsync}: pre-fetches every <img src=> URL,
 *   probes its dimensions via sharp, and emits a real {@link ImageRun} so the
 *   image is embedded in the .docx.
 */
export function htmlToDocxParagraphs(html: string | undefined | null): Paragraph[] {
  return renderAll(html, undefined);
}

export type ImageCache = Map<
  string,
  { data: Buffer; width: number; height: number }
>;

export async function htmlToDocxParagraphsAsync(
  html: string | undefined | null,
): Promise<Paragraph[]> {
  if (!html) return [];
  const cache = await prefetchImages(html);
  return renderAll(html, cache);
}

/** Pre-fetch every <img src=> URL referenced in `html`, in parallel. */
export async function prefetchImages(
  html: string | undefined | null,
): Promise<ImageCache> {
  const cache: ImageCache = new Map();
  if (!html) return cache;
  const urls = new Set<string>();
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) urls.add(m[1]);
  if (urls.size === 0) return cache;
  // dynamic import sharp lazily — not all callers are server-only
  type SharpFn = (buf: Buffer | Uint8Array) => {
    metadata: () => Promise<{ width?: number; height?: number; format?: string }>;
  };
  let sharp: SharpFn | null = null;
  try {
    const mod = (await import("sharp")) as unknown as { default: SharpFn };
    sharp = mod.default;
  } catch {
    // sharp unavailable — we'll skip dimension probing
  }
  await Promise.all(
    Array.from(urls).map(async (url) => {
      try {
        const r = await fetch(url);
        if (!r.ok) return;
        const ct = r.headers.get("content-type") || "";
        // Only embed real raster images; skip svg/data: schemes for simplicity
        if (!/^image\/(png|jpe?g|gif|webp|bmp)$/i.test(ct)) return;
        const buf = Buffer.from(await r.arrayBuffer());
        // cap at 5 MB; anything larger likely the upload limit anyway
        if (buf.byteLength > 6 * 1024 * 1024) return;
        let width = 480;
        let height = 320;
        if (sharp) {
          try {
            const meta = await sharp(buf).metadata();
            if (meta.width && meta.height) {
              const max = 480;
              if (meta.width > max) {
                height = Math.round((meta.height * max) / meta.width);
                width = max;
              } else {
                width = meta.width;
                height = meta.height;
              }
            }
          } catch {
            // keep defaults
          }
        }
        cache.set(url, { data: buf, width, height });
      } catch {
        // network/timeout — skip; sync placeholder will render instead
      }
    }),
  );
  return cache;
}

function renderAll(
  html: string | undefined | null,
  imageCache: ImageCache | undefined,
): Paragraph[] {
  if (!html) return [];
  if (!/<\w+[^>]*>/.test(html)) {
    return html
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((line) => new Paragraph({ children: [new TextRun({ text: line })] }));
  }
  const out: Paragraph[] = [];
  const blocks = splitBlocks(html);
  for (const block of blocks) {
    out.push(...renderBlock(block, imageCache));
  }
  return out;
}

interface Block {
  tag: string;
  attrs: string;
  inner: string;
}

function splitBlocks(html: string): Block[] {
  const result: Block[] = [];
  // Match top-level block elements
  const regex =
    /<(p|h2|h3|h4|ul|ol|blockquote|pre)([^>]*)>([\s\S]*?)<\/\1>/gi;
  let lastEnd = 0;
  let match;
  while ((match = regex.exec(html))) {
    const before = html.slice(lastEnd, match.index).trim();
    if (before) {
      result.push({ tag: "p", attrs: "", inner: before });
    }
    result.push({
      tag: match[1].toLowerCase(),
      attrs: match[2] || "",
      inner: match[3],
    });
    lastEnd = match.index + match[0].length;
  }
  const tail = html.slice(lastEnd).trim();
  if (tail) result.push({ tag: "p", attrs: "", inner: tail });
  return result;
}

function renderBlock(b: Block, imageCache: ImageCache | undefined): Paragraph[] {
  switch (b.tag) {
    case "h2":
      return [
        new Paragraph({
          spacing: { before: 100, after: 40 },
          children: parseInline(b.inner, { bold: true }, imageCache),
        }),
      ];
    case "h3":
    case "h4":
      return [
        new Paragraph({
          spacing: { before: 80, after: 30 },
          children: parseInline(b.inner, { bold: true, italics: true }, imageCache),
        }),
      ];
    case "ul":
    case "ol": {
      const items = [...b.inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
      return items.map(
        (m) =>
          new Paragraph({
            bullet: { level: 0 },
            children: parseInline(m[1], {}, imageCache),
          }),
      );
    }
    case "blockquote":
      return [
        new Paragraph({
          indent: { left: 360 },
          children: parseInline(b.inner, { italics: true }, imageCache),
        }),
      ];
    case "pre": {
      // strip outer <code>
      const code = b.inner.replace(/^<code[^>]*>/i, "").replace(/<\/code>$/i, "");
      return code
        .split("\n")
        .map(
          (line) =>
            new Paragraph({
              children: [new TextRun({ text: line, font: "Consolas" })],
            }),
        );
    }
    case "p":
    default: {
      // <br/> splits into multiple lines but stays in one paragraph (TextRun break)
      const children = parseInline(b.inner, {}, imageCache);
      if (children.length === 0) return [];
      return [new Paragraph({ children })];
    }
  }
}

interface Style {
  bold?: boolean;
  italics?: boolean;
  underline?: { type: "single" } | undefined;
  strike?: boolean;
  font?: string;
}

function imageRunFor(
  src: string,
  alt: string,
  imageCache: ImageCache | undefined,
): TextRun | ImageRun {
  const cached = imageCache?.get(src);
  if (cached) {
    // Detect format hint from src for ImageRun.type
    const lower = src.toLowerCase();
    let type: "png" | "jpg" | "gif" | "bmp" = "png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) type = "jpg";
    else if (lower.endsWith(".gif")) type = "gif";
    else if (lower.endsWith(".bmp")) type = "bmp";
    return new ImageRun({
      data: cached.data,
      type,
      transformation: { width: cached.width, height: cached.height },
    });
  }
  const label = alt || src || "изображение";
  return new TextRun({
    text: ` [фото: ${label}] `,
    italics: true,
    color: "888888",
  });
}

function parseInline(
  html: string,
  inherit: Style = {},
  imageCache: ImageCache | undefined,
): Array<TextRun | ExternalHyperlink | ImageRun> {
  const result: Array<TextRun | ExternalHyperlink | ImageRun> = [];
  let i = 0;
  while (i < html.length) {
    const next = html.indexOf("<", i);
    if (next === -1) {
      const text = decodeEntities(html.slice(i));
      if (text) result.push(new TextRun({ text, ...inherit }));
      break;
    }
    if (next > i) {
      const text = decodeEntities(html.slice(i, next));
      if (text) result.push(new TextRun({ text, ...inherit }));
    }
    // Find tag end
    const tagEnd = html.indexOf(">", next);
    if (tagEnd === -1) break;
    const raw = html.slice(next + 1, tagEnd);
    if (raw.startsWith("br")) {
      result.push(new TextRun({ text: "", break: 1 }));
      i = tagEnd + 1;
      continue;
    }
    if (raw.startsWith("img")) {
      const srcMatch = raw.match(/src=["']([^"']+)["']/i);
      const altMatch = raw.match(/alt=["']([^"']*)["']/i);
      const src = srcMatch?.[1] || "";
      const alt = altMatch?.[1] || "";
      result.push(imageRunFor(src, alt, imageCache));
      i = tagEnd + 1;
      continue;
    }
    if (raw.startsWith("/")) {
      // closing tag without opening — skip
      i = tagEnd + 1;
      continue;
    }
    // Self-closing or inline tag: find matching close
    const tagName = raw.split(/[\s/>]/)[0].toLowerCase();
    if (raw.endsWith("/")) {
      i = tagEnd + 1;
      continue;
    }
    const closeRe = new RegExp(`</${tagName}>`, "i");
    const closeMatch = html.slice(tagEnd + 1).match(closeRe);
    if (!closeMatch || closeMatch.index === undefined) {
      i = tagEnd + 1;
      continue;
    }
    const innerEnd = tagEnd + 1 + closeMatch.index;
    const inner = html.slice(tagEnd + 1, innerEnd);

    const nextStyle: Style = { ...inherit };
    let isLink = false;
    let href = "";
    switch (tagName) {
      case "strong":
      case "b":
        nextStyle.bold = true;
        break;
      case "em":
      case "i":
        nextStyle.italics = true;
        break;
      case "u":
        nextStyle.underline = { type: "single" };
        break;
      case "s":
      case "del":
        nextStyle.strike = true;
        break;
      case "code":
        nextStyle.font = "Consolas";
        break;
      case "a": {
        const m = raw.match(/href=["']([^"']+)["']/i);
        href = m?.[1] || "";
        isLink = true;
        break;
      }
      case "span":
      default:
        break;
    }
    const innerNodes = parseInline(inner, nextStyle, imageCache);
    if (isLink && href) {
      const linkRuns = innerNodes.filter(
        (n) => n instanceof TextRun,
      ) as TextRun[];
      if (linkRuns.length > 0) {
        result.push(
          new ExternalHyperlink({
            link: href,
            children: linkRuns.map(
              (r) =>
                new TextRun({
                  text: (r as unknown as { options?: { text?: string } }).options?.text ?? "",
                  ...nextStyle,
                  color: "0F62FE",
                  underline: { type: "single" },
                }),
            ),
          }),
        );
      }
    } else {
      result.push(...innerNodes);
    }
    i = innerEnd + closeMatch[0].length;
  }
  return result;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–");
}
