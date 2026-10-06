/**
 * Минимальный обход XML для импорта .docx.
 *
 * Зачем не regex: прежний парсер в `lib/import/docx.ts` вырезал блоки
 * регулярками вида `/<w:tbl>[\s\S]*?<\/w:tbl>/`. Ленивый квант останавливается
 * на ПЕРВОМ `</w:tbl>`, поэтому вложенная таблица (например, шапка внутри
 * ячейки) обрывала внешнюю, а её хвост попадал в следующий «элемент».
 * Кроме того, `<w:p[^>]*>` совпадало и с `<w:pPr>`, и с `<w:pStyle>`,
 * и с `<w:pict>` — то есть не только абзацы.
 *
 * Здесь настоящий обход с стеком: любые имена элементов различаются,
 * вложенность любой глубины обрабатывается корректно.
 *
 * Поддерживается то, что реально встречается в КСП-шаблонах:
 *  - `w:t`     — текст,
 *  - `w:br`    — перевод строки (внутри `w:t` он не является разрывом!),
 *  - `w:tab`   — табуляция (в табличных шаблонах иначе всё «слипается»),
 *  - `w:numPr` — настоящая нумерация Word (иначе маркированные списки
 *                терялись, потому что маркер берётся из numbering.xml, а
 *                не из текста),
 *  - `w:hyperlink` — текст ссылки без URL (URL лежит в rels),
 *  - `w:drawing` / `w:pict` — пропускаются.
 */

export interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  /**
   * Текст, накопленный непосредственно внутри элемента (до первого
   * вложенного тега). В OOXML текст лежит именно здесь — между
   * `<w:t>` и `</w:t>`, — и при отбрасывании «не-разметки» он бы
   * потерялся целиком.
   */
  text?: string;
}

const SELF_CLOSING = new Set(["w:br", "w:tab", "w:cr"]);

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

export function decodeEntities(value: string): string {
  if (!value.includes("&")) return value;
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith("#")) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([\w:.-]+)\s*=\s*"([^"]*)"|([\w:.-]+)\s*=\s*'([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if (m[1] !== undefined) attrs[m[1]] = decodeEntities(m[2] ?? "");
    else if (m[3] !== undefined) attrs[m[3]] = decodeEntities(m[4] ?? "");
  }
  return attrs;
}

/** Разбирает XML в дерево элементов с сохранением текста между тегами. */
export function parseXml(xml: string): XmlNode | null {
  const root: XmlNode = { tag: "#root", attrs: {}, children: [] };
  const stack: XmlNode[] = [root];

  // Сначала вырезаем комментарии и PI, чтобы их содержимое не попало в текст.
  const cleaned = xml.replace(/<!--[\s\S]*?-->/g, "").replace(/<\?[\s\S]*?\?>/g, "");

  // Единый проход по тегам; текст между ними накапливаем в текущем узел.
  const re = /<\/?([\w:.-]+)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(cleaned)) !== null) {
    const [full, tag, rawAttrs, selfClose, rawText] = m;

    if (full.startsWith("<?") || full.startsWith("<!")) continue;

    if (rawText !== undefined) {
      // Текстовый узел: декодируем сущности.
      const current = stack[stack.length - 1]!;
      current.text = (current.text ?? "") + decodeEntities(rawText);
      continue;
    }

    if (tag === undefined) continue;

    if (full.startsWith("</")) {
      // Закрывающий тег: снимаем со стека до совпадения имени.
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i]!.tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const node: XmlNode = { tag, attrs: parseAttrs(rawAttrs ?? ""), children: [], text: "" };
    stack[stack.length - 1]!.children.push(node);
    if (!selfClose && !SELF_CLOSING.has(tag)) stack.push(node);
  }

  return root;
}

/** Текст одного абзаца: `w:t` + переводы строк + табуляции + маркеры списка. */
export function paragraphText(node: XmlNode): string {
  let out = node.text ?? "";
  let numbered = false;

  const walk = (n: XmlNode): void => {
    // Сначала решаем, брать ли вообще текст этого узла: у w:instrText
    // (инструкции полей вида PAGE) текст — служебный, в содержимое не идёт.
    switch (n.tag) {
      case "w:br":
      case "w:cr":
        out += "\n";
        return;
      case "w:tab":
        out += "\t";
        return;
      case "w:numPr":
        // Настоящий список Word: маркер берётся из numbering.xml, в тексте
        // его нет. Без этой проверки экспортированные нами цели приходили
        // пустыми при обратном импорте.
        numbered = true;
        return;
      case "w:drawing":
      case "w:pict":
      case "w:instrText":
        return;
      default:
        break;
    }

    if (n.text) out += n.text;
    for (const child of n.children) walk(child);
  };

  for (const child of node.children) walk(child);

  if (numbered && out.trim() && !/^[•\-–—*]/.test(out)) out = `• ${out}`;

  return out;
}

/**
 * Разбор `w:body` на элементы верхнего уровня: `w:p` и `w:tbl`.
 * Вложенные таблицы остаются внутри своей ячейки, как и в Word.
 */
export interface ParsedElement {
  type: "paragraph" | "table";
  text?: string;
  rows?: string[][];
}

export function parseBodyElements(xml: string): ParsedElement[] {
  const root = parseXml(xml);
  if (!root) return [];

  const body = findFirst(root, "w:body") ?? root;
  const elements: ParsedElement[] = [];

  for (const child of body.children) {
    if (child.tag === "w:tbl") {
      elements.push({ type: "table", rows: tableRows(child) });
    } else if (child.tag === "w:p") {
      const text = paragraphText(child).trim();
      if (text) elements.push({ type: "paragraph", text });
    }
  }

  return elements;
}

export function findFirst(node: XmlNode, tag: string): XmlNode | null {
  if (node.tag === tag) return node;
  for (const child of node.children) {
    const found = findFirst(child, tag);
    if (found) return found;
  }
  return null;
}

/** Строки таблицы; вложенные `w:tbl` не разрывают внешнюю структуру. */
export function tableRows(table: XmlNode): string[][] {
  const rows: string[][] = [];
  for (const child of directChildren(table, "w:tr")) {
    const cells: string[] = [];
    for (const cell of directChildren(child, "w:tc")) {
      const parts: string[] = [];
      // Ячейка содержит абзацы и, возможно, вложенные таблицы —
      // берём абзацы, вложенные таблицы игнорируем (их текст уже в ячейке
      // не входит в шапку КСП).
      collectParagraphs(cell, parts);
      cells.push(parts.join("\n").trim());
    }
    rows.push(cells);
  }
  return rows;
}

/** Прямые потомки с указанным именем (не рекурсивно). */
function directChildren(node: XmlNode, tag: string): XmlNode[] {
  return node.children.filter((c) => c.tag === tag);
}

function collectParagraphs(node: XmlNode, out: string[]): void {
  for (const child of node.children) {
    if (child.tag === "w:p") {
      const text = paragraphText(child).trim();
      if (text) out.push(text);
      continue;
    }
    // Вложенная таблица: её абзацы — часть содержимого ячейки. Обходим
    // рекурсивно, потому что между ячейкой и абзацем стоят ещё `w:tbl > w:tr > w:tc`.
    if (child.tag === "w:tbl" || child.tag === "w:tr" || child.tag === "w:tc") {
      collectParagraphs(child, out);
    }
  }
}

/** Стиль абзаца (`w:pStyle`) для распознавания заголовков. */
export function paragraphStyle(node: XmlNode): string {
  const pPr = node.children.find((c) => c.tag === "w:pPr");
  if (!pPr) return "";
  const style = pPr.children.find((c) => c.tag === "w:pStyle");
  return style?.attrs["w:val"] ?? "";
}