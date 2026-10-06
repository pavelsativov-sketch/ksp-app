import { describe, it, expect } from "vitest";
import { parseBodyElements, paragraphText, parseXml, decodeEntities } from "@/lib/import/xml";

/**
 * Регрессия по парсеру импорта DOCX.
 *
 * Прежняя реализация вырезала блоки регулярками:
 *   /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[^>]*>[\s\S]*?<\/w:p>/g
 * Из-за этого:
 *  - вложенная таблица обрывала внешнюю (ленивый квант останавливается на
 *    первом `</w:tbl>`);
 *  - `<w:p[^>]*>` совпадало с `<w:pPr>`, `<w:pStyle>`, `<w:pict>`;
 *  - `w:numPr` (настоящий список Word) игнорировался, поэтому маркированные
 *    списки — цели, критерии — импортировались пустыми;
 *  - `w:br` и `w:tab` терялись, абзацы слипались в одно слово;
 *  - `&amp;` и прочие сущности не декодировались.
 */
const doc = (body: string) =>
  `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${body}</w:body></w:document>`;

describe("разбор XML: вложенность", () => {
  it("не путает w:p с w:pPr / w:pStyle / w:pict", () => {
    const elements = parseBodyElements(
      doc(
        `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Заголовок</w:t></w:r></w:p>` +
          `<w:p><w:r><w:t>Первый</w:t></w:r></w:p>`,
      ),
    );
    expect(elements).toHaveLength(2);
    expect(elements[0]).toMatchObject({ type: "paragraph", text: "Заголовок" });
    expect(elements[1]).toMatchObject({ type: "paragraph", text: "Первый" });
  });

  it("вложенная таблица не разрывает внешнюю", () => {
    const elements = parseBodyElements(
      doc(
        `<w:tbl><w:tr><w:tc>` +
          `<w:p><w:r><w:t>Шапка</w:t></w:r></w:p>` +
          `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Вложенная</w:t></w:r></w:p></w:tc></w:tr></w:tbl>` +
          `<w:p><w:r><w:t>Хвост ячейки</w:t></w:r></w:p>` +
          `</w:tc><w:tc><w:p><w:r><w:t>Вторая</w:t></w:r></w:p></w:tc></w:tr></w:tbl>` +
          `<w:p><w:r><w:t>После таблицы</w:t></w:r></w:p>`,
      ),
    );

    // Одна таблица + один абзац после неё: структура не рассыпалась.
    expect(elements).toHaveLength(2);
    expect(elements[0]!.type).toBe("table");
    expect(elements[1]).toMatchObject({ type: "paragraph", text: "После таблицы" });

    const rows = elements[0]!.rows!;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(2);
    // Ячейка содержит и абзац, и содержимое вложенной таблицы, и хвост.
    expect(rows[0]![0]).toContain("Шапка");
    expect(rows[0]![0]).toContain("Вложенная");
    expect(rows[0]![0]).toContain("Хвост ячейки");
    expect(rows[0]![1]).toBe("Вторая");
  });

  it("переживает незакрытый тег (битый документ)", () => {
    const root = parseXml(doc(`<w:p><w:r><w:t>Текст`));
    expect(root).not.toBeNull();
    expect(() => parseBodyElements(doc(`<w:p><w:r><w:t>Текст`))).not.toThrow();
  });
});

describe("разбор XML: форматирование", () => {
  it("сохраняет переводы строк и табуляции", () => {
    const elements = parseBodyElements(
      doc(`<w:p><w:r><w:t>строка1</w:t></w:r><w:r><w:br/><w:t>строка2</w:t></w:r></w:p>`),
    );
    expect(elements[0]!.text).toBe("строка1\nстрока2");
  });

  it("превращает w:tab в табуляцию, а не склеивает слова", () => {
    const elements = parseBodyElements(
      doc(`<w:p><w:r><w:t>Ключевые фразы</w:t><w:r><w:tab/></w:r><w:r><w:t>читаю дробь</w:t></w:r></w:p>`),
    );
    expect(elements[0]!.text).toBe("Ключевые фразы\tчитаю дробь");
  });

  it("добавляет маркер настоящему списку Word (w:numPr)", () => {
    const elements = parseBodyElements(
      doc(
        `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Ученик читает дробь</w:t></w:r></w:p>`,
      ),
    );
    expect(elements[0]!.text).toBe("• Ученик читает дробь");
  });

  it("не дублирует маркер, если он уже есть в тексте", () => {
    const elements = parseBodyElements(
      doc(`<w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>• Уже с маркером</w:t></w:r></w:p>`),
    );
    expect(elements[0]!.text).toBe("• Уже с маркером");
  });

  it("декодирует сущности", () => {
    expect(decodeEntities("a &amp; b")).toBe("a & b");
    expect(decodeEntities("&lt;тег&gt;")).toBe("<тег>");
    expect(decodeEntities("&#1055;&#1088;&#1080;&#1074;&#1077;&#1090;")).toBe("Привет");
    expect(decodeEntities("&quot;кавычки&quot;")).toBe('"кавычки"');
    expect(decodeEntities("обычный текст")).toBe("обычный текст");

    const elements = parseBodyElements(doc(`<w:p><w:r><w:t>5 &lt; 7 &amp;&amp; 7 &gt; 5</w:t></w:r></w:p>`));
    expect(elements[0]!.text).toBe("5 < 7 && 7 > 5");
  });

  it("игнорирует гиперссылки как разметку, но сохраняет их текст", () => {
    const elements = parseBodyElements(
      doc(`<w:p><w:hyperlink r:id="rId5"><w:r><w:t>bilimland.kz</w:t></w:r></w:hyperlink></w:p>`),
    );
    expect(elements[0]!.text).toBe("bilimland.kz");
  });

  it("не тащит текст инструкций полей (w:instrText)", () => {
    const elements = parseBodyElements(
      doc(
        `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:t>стр</w:t></w:r></w:p>`,
      ),
    );
    expect(elements[0]!.text).not.toContain("PAGE");
    expect(elements[0]!.text).toContain("стр");
  });
});

describe("разбор XML: таблицы", () => {
  it("принимает шапку из 4–6 колонок, а не ровно 5", () => {
    for (const columns of [4, 5, 6]) {
      const cells = Array.from({ length: columns }, (_, i) => `<w:tc><w:p><w:r><w:t>К${i}</w:t></w:r></w:p></w:tc>`).join("");
      const elements = parseBodyElements(doc(`<w:tbl><w:tr>${cells}</w:tr></w:tbl>`));
      expect(elements[0]!.rows![0]).toHaveLength(columns);
    }
  });

  it("склеивает несколько абзацев ячейки переводом строки", () => {
    const elements = parseBodyElements(
      doc(
        `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>первый</w:t></w:r></w:p><w:p><w:r><w:t>второй</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`,
      ),
    );
    expect(elements[0]!.rows![0]![0]).toBe("первый\nвторой");
  });

  it("пустые ячейки дают пустые строки, а не пропадают", () => {
    const elements = parseBodyElements(
      doc(`<w:tbl><w:tr><w:tc><w:p/></w:tc><w:tc><w:p><w:r><w:t>есть</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`),
    );
    expect(elements[0]!.rows![0]).toHaveLength(2);
    expect(elements[0]!.rows![0]![0]).toBe("");
  });
});

describe("paragraphText", () => {
  it("возвращает текст узла без дочерних элементов", () => {
    const root = parseXml(`<w:p>привет</w:p>`)!;
    const p = root.children[0]!;
    expect(paragraphText(p)).toBe("привет");
  });
});