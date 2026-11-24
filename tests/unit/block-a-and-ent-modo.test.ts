import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from "docx";
import { parseDocxWithMeta } from "@/lib/import/docx";
import { inferSubjectByObjectives } from "@/lib/goso/local";
import {
  extractRowsFromOfficeFile,
  parseKtpFromRows,
  parseStudentsFromRows,
} from "@/lib/office-table-import";
import {
  combinedDomainInstructions,
  detectDomainSkills,
} from "@/lib/agents/domain-skills";
import { classifyClick } from "@/lib/agents/computer/safety";
import { productTools } from "@/lib/agents/tools/product";
import { sorVariantToInteractiveTasks, type SorSochWork } from "@/lib/ai/sor-soch-generator";
import {
  entModoToInteractiveTasks,
  evaluateEntModoAttempt,
  scoreEntMultiSelect,
  type EntModoWork,
} from "@/lib/ai/ent-modo-models";
import { buildEntModoDocx } from "@/lib/ai/ent-modo-generator";
import { interactiveTaskSchema } from "@/lib/validation/ksp";

async function buildSampleKzKspDocx(): Promise<Buffer> {
  const cell = (text: string) =>
    new TableCell({ children: [new Paragraph({ children: [new TextRun(text)] })] });

  const doc = new Document({
    sections: [
      {
        children: [
          new Table({
            rows: [
              new TableRow({
                children: [cell("Пән"), cell("Алгебра"), cell("Сынып"), cell("8 «Ә»")],
              }),
              new TableRow({
                children: [cell("Тоқсан"), cell("II тоқсан"), cell("Күні"), cell("15.11.2026")],
              }),
              new TableRow({
                children: [
                  cell("Ұзақ мерзімді жоспар бөлімі"),
                  cell("8.2А Квадрат теңдеулер"),
                  cell("Мұғалімнің аты-жөні"),
                  cell("Оспанова А.Б."),
                ],
              }),
              new TableRow({
                children: [
                  cell("Сабақ тақырыбы"),
                  cell("Квадрат теңдеудің түбірлері"),
                  cell("Мектеп"),
                  cell("№12 мектеп-гимназия"),
                ],
              }),
            ],
          }),
          new Paragraph({ children: [new TextRun("Оқу бағдарламасына сәйкес оқу мақсаттары")] }),
          new Paragraph({
            children: [new TextRun("• 8.2.2.1 — квадрат теңдеудің анықтамасын білу")],
          }),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

async function buildSampleXlsx(rows: string[][]): Promise<Uint8Array> {
  const zip = new JSZip();
  const sst: string[] = [];
  const xmlRows = rows
    .map((r, rIdx) => {
      const cells = r
        .map((val, cIdx) => {
          const colLetter = String.fromCharCode(65 + cIdx);
          if (/^\d+$/.test(val)) {
            return `<c r="${colLetter}${rIdx + 1}"><v>${val}</v></c>`;
          }
          const idx = sst.length;
          sst.push(val);
          return `<c r="${colLetter}${rIdx + 1}" t="s"><v>${idx}</v></c>`;
        })
        .join("");
      return `<row r="${rIdx + 1}">${cells}</row>`;
    })
    .join("");

  const sstXml = `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sst.length}" uniqueCount="${sst.length}">
${sst.map((s) => `<si><t>${s}</t></si>`).join("")}
</sst>`;

  const sheetXml = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${xmlRows}</sheetData>
</worksheet>`;

  zip.file("xl/sharedStrings.xml", sstXml);
  zip.file("xl/worksheets/sheet1.xml", sheetXml);
  return zip.generateAsync({ type: "uint8array" });
}

describe("Блок А.1 — умный импорт КСП из Word с автоопределением метаданных", () => {
  it("распознаёт предмет, класс, четверть, язык kz и раздел ДП из 4-колоночной шапки", async () => {
    const buf = await buildSampleKzKspDocx();
    const { content, detected } = await parseDocxWithMeta(buf);

    expect(content.topic).toBe("Квадрат теңдеудің түбірлері");
    expect(detected.subjectName).toBe("Алгебра");
    expect(detected.grade).toBe(8);
    expect(detected.quarter).toBe(2);
    expect(detected.language).toBe("kz");
    expect(detected.section).toBe("8.2А Квадрат теңдеулер");
  });

  it("определяет предмет по кодам и формулировкам целей ГОСО, если в шапке нет графы «Предмет»", () => {
    const inferred = inferSubjectByObjectives(
      [{ code: "8.1.2.1", text: "применять свойства арифметического квадратного корня" }],
      8,
      "Арифметический квадратный корень",
    );
    expect(inferred).toBe("Алгебра");
  });
});

describe("Блок А.5 — прямой импорт .xlsx / .docx / .csv для КТП и списков учеников", () => {
  it("читает настоящий .xlsx с таблицей КТП (разделы, темы, часы, цели ГОСО)", async () => {
    const bytes = await buildSampleXlsx([
      ["Календарно-тематический план по предмету Информатика, 8 класс"],
      ["№", "Раздел", "Тема урока", "Цели обучения", "Кол-во часов"],
      ["1", "Раздел 1. Компьютерные системы", "Измерение информации", "8.2.1.1", "1"],
      ["2", "", "Программное обеспечение", "8.1.2.1", "2"],
      ["", "", "Итого за четверть", "", "16"],
    ]);

    const rows = await extractRowsFromOfficeFile(bytes, "ktp-8.xlsx");
    const parsed = parseKtpFromRows(rows);

    expect(parsed.detectedSubject).toBe("Информатика");
    expect(parsed.detectedGrade).toBe(8);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]).toMatchObject({
      section: "Раздел 1. Компьютерные системы",
      title: "Измерение информации",
      hours: 1,
      objectives: "8.2.1.1",
    });
    expect(parsed.items[1]).toMatchObject({
      section: "Раздел 1. Компьютерные системы",
      title: "Программное обеспечение",
      hours: 2,
      objectives: "8.1.2.1",
    });
  });

  it("извлекает список учеников из .xlsx с раздельными колонками Фамилия / Имя / Класс", async () => {
    const bytes = await buildSampleXlsx([
      ["№", "Фамилия", "Имя", "Класс"],
      ["1", "Алиев", "Санжар", "9 «А»"],
      ["2", "Бекова", "Аружан", "9 «Б»"],
    ]);

    const rows = await extractRowsFromOfficeFile(bytes, "roster.xlsx");
    const students = parseStudentsFromRows(rows, "7А");

    expect(students).toEqual([
      { fullName: "Алиев Санжар", className: "9А" },
      { fullName: "Бекова Аружан", className: "9Б" },
    ]);
  });
});

describe("Блок А.2 и А.3 — инструменты агента и навыки Kundelik.kz / НОБД", () => {
  it("регистрирует новые продуктовые инструменты агента", () => {
    expect(typeof productTools.createSorSoch).toBe("function");
    expect(typeof productTools.createPresentation).toBe("function");
    expect(typeof productTools.assignHomework).toBe("function");
    expect(typeof productTools.createSchoolDoc).toBe("function");
  });

  it("подключает предметные навыки Kundelik.kz и НОБД по URL и тексту задачи", () => {
    expect(detectDomainSkills("Проверь журнал в Кунделике", "")).toContain("kundelik");
    expect(detectDomainSkills("", "https://schools.kundelik.kz/marks")).toContain("kundelik");
    expect(detectDomainSkills("Сверь контингент в НОБД", "")).toContain("nobd");
    expect(detectDomainSkills("", "https://nobd.edu.kz/passport")).toContain("nobd");
    expect(combinedDomainInstructions("Открой ҰБДҚ", "")).toContain("NCALayer");
  });

  it("блокирует без подтверждения опасные действия в Kundelik и НОБД", () => {
    expect(classifyClick("Подписать ЭЦП").requiresConfirmation).toBe(true);
    expect(classifyClick("Отправить в НОБД").requiresConfirmation).toBe(true);
    expect(classifyClick("Подтвердить контингент").requiresConfirmation).toBe(true);
    expect(classifyClick("Баға қою").requiresConfirmation).toBe(true);
    expect(classifyClick("Үй тапсырмасын беру").requiresConfirmation).toBe(true);
  });
});

describe("Блок А.4 — конвертация вариантов СОР/СОЧ в онлайн-выдачу по коду", () => {
  it("превращает Вариант 1 и Вариант 2 в валидные InteractiveTask", () => {
    const sampleSor: SorSochWork = {
      title: "СОР №1 по алгебре",
      subject: "Алгебра",
      grade: 8,
      quarter: 1,
      workType: "СОР №1",
      language: "ru",
      durationMinutes: 25,
      maxPoints: 5,
      sectionOrTopic: "Квадратные корни",
      learningObjectives: ["8.1.1.1 знать иррациональные числа"],
      thinkingLevels: { knowledgePercent: 40, applicationPercent: 60, higherOrderPercent: 0 },
      variant1: [
        {
          number: 1,
          level: "knowledge",
          taskType: "mcq",
          prompt: "Выберите иррациональное число",
          options: ["4", "√2", "0,5", "-3"],
          points: 2,
        },
        {
          number: 2,
          level: "application",
          taskType: "short",
          prompt: "Вычислите √49",
          points: 3,
        },
      ],
      variant2: [
        {
          number: 1,
          level: "knowledge",
          taskType: "mcq",
          prompt: "Выберите иррациональное число",
          options: ["9", "1,2", "√3", "0"],
          points: 2,
        },
        {
          number: 2,
          level: "application",
          taskType: "short",
          prompt: "Вычислите √64",
          points: 3,
        },
      ],
      descriptors: [
        {
          taskNumber: 1,
          criterion: "Определяет иррациональное число",
          steps: ["Указывает корень"],
          points: 2,
          answerVariant1: "Б",
          answerVariant2: "В",
        },
        {
          taskNumber: 2,
          criterion: "Извлекает квадратный корень",
          steps: ["Находит значение"],
          points: 3,
          answerVariant1: "x = 7",
          answerVariant2: "8",
        },
      ],
      rubric: [{ criterion: "Корни", low: "Низкий", medium: "Средний", high: "Высокий" }],
    };

    const v1 = sorVariantToInteractiveTasks(sampleSor, 1);
    const v2 = sorVariantToInteractiveTasks(sampleSor, 2);

    expect(v1.every((t) => interactiveTaskSchema.safeParse(t).success)).toBe(true);
    expect(v2.every((t) => interactiveTaskSchema.safeParse(t).success)).toBe(true);
    expect(v1[0]?.type === "MCQ" && v1[0].correctIndex).toBe(1);
    expect(v2[0]?.type === "MCQ" && v2[0].correctIndex).toBe(2);
    expect(v1[1]?.type === "SHORT_ANSWER" && v1[1].acceptedAnswers).toContain("7");
  });
});

describe("Блок Б.9 — Тренажёр и генератор ЕНТ / МОДО (шкала НЦТ, DOCX и онлайн-квиз)", () => {
  it("оценивает множественный выбор ЕНТ строго по шкале НЦТ РК (0 / 1 / 2 балла)", () => {
    expect(scoreEntMultiSelect([0, 2, 4], [0, 2, 4])).toBe(2); // полное совпадение
    expect(scoreEntMultiSelect([0, 2], [0, 2, 4])).toBe(1); // 1 недовыбран
    expect(scoreEntMultiSelect([0, 2, 5], [0, 2])).toBe(1); // 1 лишний
    expect(scoreEntMultiSelect([0], [0, 2, 4])).toBe(0); // 2 ошибки
    expect(scoreEntMultiSelect([], [0])).toBe(0); // пусто
    expect(scoreEntMultiSelect([0, 1, 2, 3], [0, 1, 2])).toBe(0); // выбрано > 3
  });

  it("считает общий балл по целям ГОСО, собирает .docx и конвертирует вариант для /a/[code]", async () => {
    const sampleEnt: EntModoWork = {
      title: "Тренировочный вариант ЕНТ: Информатика",
      examKind: "ent_11",
      subject: "Информатика",
      grade: 11,
      language: "ru",
      durationMinutes: 60,
      maxPoints: 7,
      partA: [
        {
          number: 1,
          objectiveCode: "11.1.1.1",
          prompt: "Чему равен 1 байт?",
          options: ["4 бита", "8 бит", "10 бит", "16 бит"],
          correctIndex: 1,
          points: 1,
          explanation: "В одном байте 8 бит.",
        },
        {
          number: 2,
          objectiveCode: "11.1.1.2",
          prompt: "База восьмеричной системы?",
          options: ["2", "8", "10", "16"],
          correctIndex: 1,
          points: 1,
          explanation: "Основание равно 8.",
        },
        {
          number: 3,
          objectiveCode: "11.1.1.2",
          prompt: "База двоичной системы?",
          options: ["2", "8", "10", "16"],
          correctIndex: 0,
          points: 1,
          explanation: "Основание равно 2.",
        },
      ],
      contextBlock: {
        title: "Сетевые протоколы",
        passage: "Протокол HTTPS обеспечивает защищённую передачу гипертекста поверх TLS.",
        questions: [
          {
            number: 4,
            objectiveCode: "11.4.2.1",
            prompt: "Какой протокол шифрует трафик?",
            options: ["HTTP", "FTP", "HTTPS", "Telnet"],
            correctIndex: 2,
            points: 1,
            explanation: "HTTPS использует TLS.",
          },
          {
            number: 5,
            objectiveCode: "11.4.2.1",
            prompt: "Поверх чего работает HTTPS?",
            options: ["TLS", "UDP", "ICMP", "ARP"],
            correctIndex: 0,
            points: 1,
            explanation: "Поверх TLS.",
          },
        ],
      },
      partC: [
        {
          number: 6,
          objectiveCode: "11.3.1.1",
          prompt: "Выберите СУБД:",
          options: ["PostgreSQL", "HTML", "MySQL", "CSS", "SQLite", "JPEG"],
          correctIndices: [0, 2, 4],
          points: 2,
          explanation: "PostgreSQL, MySQL и SQLite — реляционные СУБД.",
        },
      ],
    };

    const evalRes = evaluateEntModoAttempt(sampleEnt, {
      single: { 1: 1, 2: 1, 3: 3, 4: 2, 5: 0 },
      multi: { 6: [0, 2] }, // 1 балл из 2
    });
    expect(evalRes.score).toBe(5);
    expect(evalRes.maxPoints).toBe(7);

    const tasks = entModoToInteractiveTasks(sampleEnt);
    expect(tasks).toHaveLength(6);
    expect(tasks.every((t) => interactiveTaskSchema.safeParse(t).success)).toBe(true);

    const docxBuf = await buildEntModoDocx(sampleEnt);
    const zip = await JSZip.loadAsync(docxBuf);
    const docXml = await zip.file("word/document.xml")?.async("string");
    expect(docXml).toContain("Тренировочный вариант ЕНТ");
    expect(docXml).toContain("PostgreSQL");
  });
});
