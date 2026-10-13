import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  loadArmanPvCatalog,
  parseArmanPvGradeHtml,
  detectArmanPvLanguage,
  mapArmanPvSubjectNameRu,
  formatArmanPvTextbookTitle,
} from "./armanpv";
import { extractRequestedPageNumbers, extractSectionMarkers } from "./retrieve";
import { chunkPages } from "./chunk";

describe("Arman-PV official textbook catalog (https://www.armanpv.com/)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads all 123 official textbooks across grades 1–11 with valid PDF links and mapped subjects", () => {
    const catalog = loadArmanPvCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(120);

    const grades = new Set(catalog.map((c) => c.grade));
    for (let g = 1; g <= 11; g++) {
      expect(grades.has(g)).toBe(true);
    }

    for (const item of catalog) {
      expect(item.id).toMatch(/^armanpv_\d+_/);
      expect(item.title.length).toBeGreaterThan(1);
      expect(item.pdfUrl).toMatch(
        /^https:\/\/(www\.armanpv\.com\/_files\/ugd\/|cloud\.mail\.ru\/public\/|s3-almaty\.abay\.kazteleport\.kz\/)/,
      );
      expect(item.subjectNameRu).toBeTruthy();
      expect(["ru", "kz", "ug", "uz"]).toContain(item.language);
    }
  });

  it("detects textbook language accurately across Kazakh, Russian, Uyghur, and Uzbek", () => {
    expect(
      detectArmanPvLanguage(
        "Информатика",
        "Жалпы білім беретін мектептің 7-сынып оқушыларына арналған оқулық",
      ),
    ).toBe("kz");
    expect(
      detectArmanPvLanguage(
        "Информатика",
        "Учебник для учащихся 7 класса общеобразовательной школы",
      ),
    ).toBe("ru");
    expect(
      detectArmanPvLanguage(
        "Қазақ тілі",
        "Учебник для учащихся 7 класса общеобразовательной школы с неказахским языком обучения",
      ),
    ).toBe("ru");
    expect(
      detectArmanPvLanguage(
        "Цифрлиқ саватлиқ",
        "Башланғуч билим бериш басқучиниң 2-синип оқуғучилириға беғишланған дәрислик",
      ),
    ).toBe("ug");
    expect(
      detectArmanPvLanguage(
        "Ахборот-коммуникацион технологиялари",
        "Умумтаълим мактабларининг 4-синф ўқувчиларига мўлжалланган дарслик",
      ),
    ).toBe("uz");
  });

  it("maps Arman-PV titles and descriptions to GOSO subject names", () => {
    expect(mapArmanPvSubjectNameRu("Цифрлық сауаттылық", "1-сынып оқулық", 1)).toBe(
      "Цифровая грамотность",
    );
    expect(mapArmanPvSubjectNameRu("Информатика", "7 класс учебник", 7)).toBe("Информатика");
    expect(mapArmanPvSubjectNameRu("Алгебра и начала анализа", "10 класс", 10)).toBe(
      "Алгебра и начала анализа",
    );
    expect(mapArmanPvSubjectNameRu("Қазақ өдебиеті", "9-сынып", 9)).toBe(
      "Казахский язык и литература",
    );
    expect(mapArmanPvSubjectNameRu("Основы предпринима-тельства и бизнеса", "10 класс", 10)).toBe(
      "Основы права",
    );
  });

  it("parses Wix listitem HTML from armanpv.com/{grade}-klass", () => {
    const sampleHtml = `
      <div>
        <div role="listitem">
          <img src="https://static.wixstatic.com/media/66109b_cover123.png" alt="cover"/>
          <h4>Информатика</h4>
          <p>Учебник для учащихся 7 класса общеобразовательной школы</p>
          <a href="https://www.armanpv.com/_files/ugd/66109b_27739457007c4f3185086bf7d996d544.pdf">
            <img src="https://static.wixstatic.com/media/PDF.png" alt="PDF.png"/>
          </a>
        </div>
      </div>
    `;
    const items = parseArmanPvGradeHtml(sampleHtml, 7);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      grade: 7,
      title: "Информатика",
      language: "ru",
      subjectNameRu: "Информатика",
      isGuide: false,
      pdfUrl: "https://www.armanpv.com/_files/ugd/66109b_27739457007c4f3185086bf7d996d544.pdf",
    });
    expect(formatArmanPvTextbookTitle(items[0]!)).toBe("Информатика (7 кл., Арман-ПВ, Рус)");
  });

  it("extracts requested page numbers and section markers (§) for RAG retrieval", () => {
    expect(
      extractRequestedPageNumbers("Информатика. Тема: § 12. Алгоритмы, стр. 45–47, 50-бет"),
    ).toEqual([45, 46, 47, 50]);
    expect(extractSectionMarkers("Тема: § 12. Квадратные уравнения, 14-тақырып")).toEqual([
      "§ 12",
      "§12",
      "§ 14",
      "§14",
    ]);
  });

  it("keeps structural headings (§, Упражнение, Тапсырма) attached to their body during chunking", () => {
    const intro = "Вводный теоретический блок про линейные алгоритмы и исполнителей. ".repeat(10); // ~660 chars
    const taskBlock =
      "§ 15. Разветвляющиеся алгоритмы\nРазветвляющийся алгоритм содержит условие и две ветви выполнения программы в зависимости от истинности условия.\nЗадание 1. Составьте блок-схему для нахождения максимума двух чисел и проверьте её для значений a=5, b=9.";
    const chunks = chunkPages([{ pageNumber: 42, text: `${intro}\n${taskBlock}` }]);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.some((c) => c.content.includes("§ 15.") && c.content.includes("Разветвляющийся алгоритм"))).toBe(true);
    expect(chunks.some((c) => c.sectionTitle?.includes("§ 15"))).toBe(true);
  });
});
