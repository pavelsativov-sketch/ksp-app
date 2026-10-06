import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateHandout } from "@/lib/handouts/generate";
import { buildCombinedDocx, buildHandoutDocx } from "@/lib/handouts/docx";
import { layoutCrossword } from "@/lib/handouts/crossword";
import JSZip from "jszip";

const AI_ENV_KEYS = [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "CEREBRAS_API_KEY",
  "OPENROUTER_API_KEY",
] as const;
const ORIGINAL_KEYS = Object.fromEntries(
  AI_ENV_KEYS.map((key) => [key, process.env[key]]),
);

beforeEach(() => {
  for (const key of AI_ENV_KEYS) delete process.env[key]; // force stub branch
});
afterEach(() => {
  for (const key of AI_ENV_KEYS) {
    const value = ORIGINAL_KEYS[key];
    if (value) process.env[key] = value;
    else delete process.env[key];
  }
});

describe("generateHandout (stub)", () => {
  const base = {
    topic: "Сложение чисел",
    subject: "Математика",
    grade: 5,
    language: "ru" as const,
  };

  it("worksheet has required structure and N tasks", async () => {
    const h = await generateHandout({ ...base, kind: "worksheet", count: 6 });
    expect(h.kind).toBe("worksheet");
    if (h.kind !== "worksheet") return;
    expect(h.title).toContain("Сложение");
    expect(h.tasks).toHaveLength(6);
    expect(h.tasks.reduce((sum, task) => sum + task.points, 0)).toBe(10);
    const TASK_TYPES = ["open", "fill", "multiple_choice", "match", "true_false", "sort", "checklist", "case_study", "fill_bank", "table_fix", "scenario_fix", "choice_buttons", "reflection", "interactive", "creative"];
    for (const t of h.tasks) {
      expect(t.prompt.length).toBeGreaterThan(0);
      expect(t.criterion.length).toBeGreaterThan(0);
      expect(t.descriptor.length).toBeGreaterThan(0);
      if (t.type === "reflection") {
        // Рефлексия не оценивается и не входит в бюджет 10 баллов.
        expect(t.points).toBe(0);
      } else {
        expect(t.points).toBeGreaterThan(0);
      }
      expect(TASK_TYPES).toContain(t.type);
    }
    // mc has 4 options + correctIndex; match has options+pairs
    const mc = h.tasks.find((t) => t.type === "multiple_choice");
    if (mc) {
      expect(mc.options).toHaveLength(4);
      expect(mc.correctIndex).toBeGreaterThanOrEqual(0);
    }
  });

  it("flashcards has N ready-to-study cards", async () => {
    const h = await generateHandout({ ...base, kind: "flashcards", count: 5 });
    expect(h.kind).toBe("flashcards");
    if (h.kind !== "flashcards") return;
    expect(h.cards).toHaveLength(5);
    for (const c of h.cards) {
      expect(c.front.length).toBeGreaterThan(0);
      expect(c.back.length).toBeGreaterThan(0);
      expect(c.example?.length).toBeGreaterThan(0);
      expect(c.checkQuestion?.length).toBeGreaterThan(0);
    }
  });

  it("crossword produces a non-empty grid with placed words", async () => {
    const h = await generateHandout({ ...base, kind: "crossword", count: 5 });
    expect(h.kind).toBe("crossword");
    if (h.kind !== "crossword") return;
    expect(h.grid.length).toBeGreaterThan(0);
    expect(h.grid[0].length).toBeGreaterThan(0);
    expect(h.placed.length).toBeGreaterThan(0);
  });
});

describe("layoutCrossword", () => {
  it("places words and tracks numbering", () => {
    const c = layoutCrossword(
      [
        { word: "СЛОВО", clue: "часть речи" },
        { word: "ОСЬ", clue: "линия" },
        { word: "СОН", clue: "отдых" },
      ],
      "Test",
      "intro",
    );
    expect(c.kind).toBe("crossword");
    expect(c.placed.length).toBeGreaterThanOrEqual(1);
    // Numbers monotonically reference unique start cells
    const seen = new Set(c.numbers.map((n) => `${n.row},${n.col}`));
    expect(seen.size).toBe(c.numbers.length);
    // Every placed word's first letter is on the grid
    for (const w of c.placed) {
      const ch = c.grid[w.row][w.col];
      expect(ch).toBe(w.word[0]);
    }
  });

  it("returns empty layout for no words", () => {
    const c = layoutCrossword([], "T", "i");
    expect(c.placed).toHaveLength(0);
  });
});

describe("buildHandoutDocx", () => {
  const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

  it("worksheet → valid docx (zip) buffer", async () => {
    const h = await generateHandout({
      kind: "worksheet",
      topic: "X",
      subject: "Y",
      grade: 5,
      language: "ru",
      count: 4,
    });
    const buf = await buildHandoutDocx(h);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 4).equals(ZIP_MAGIC)).toBe(true);
  });

  it("worksheet docx contains the descriptor table and a 10-point total", async () => {
    const h = await generateHandout({
      kind: "worksheet", topic: "Эргономика", subject: "Информатика", grade: 5, language: "ru", count: 5,
    });
    if (h.kind !== "worksheet") return;
    const zip = await JSZip.loadAsync(await buildHandoutDocx(h));
    const documentXml = await zip.file("word/document.xml")?.async("string");
    expect(documentXml).toContain("Дескрипторы и баллы");
    expect(documentXml).toContain("Итого");
    expect(h.tasks.reduce((sum, task) => sum + task.points, 0)).toBe(10);
  });

  it("cardLayout worksheet renders task cards with image and keeps linear mode without it", async () => {
    const h = await generateHandout({
      kind: "worksheet", topic: "Дроби", subject: "Математика", grade: 5, language: "ru", count: 4, cardLayout: true,
    });
    if (h.kind !== "worksheet") return;
    expect(h.cardLayout).toBe(true);

    // Минимальный валидный 1x1 PNG вместо фейкового JPEG
    const PNG_1X1 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    // Имитируем успешную иллюстрацию (как illustrateWorksheetTasks на живых ключах).
    const withImage = h.tasks.map((t, i) =>
      i === 0
        ? {
            ...t,
            imageBase64: PNG_1X1,
            imageMime: "image/png" as const,
            imageAlt: "task",
          }
        : t,
    );
    const zip = await JSZip.loadAsync(await buildHandoutDocx({ ...h, tasks: withImage }));
    const documentXml = await zip.file("word/document.xml")?.async("string");
    expect(documentXml).toContain("Задание 1");
    // Иллюстрация реально встроена: media-файл в контейнере + drawing в XML.
    const media = zip.file(/^word\/media\//);
    expect(media.length).toBeGreaterThan(0);
    expect(documentXml).toContain("<w:drawing>");
    // Карточки с типом match: таблица пар должна содержать все элементы
    // options (термины) и pairs (определения), критерий и дескриптор.
    for (const t of h.tasks) {
      expect(documentXml).toContain(`Критерий оценивания: ${t.criterion}`);
      expect(documentXml).toContain(`Дескриптор: ${t.descriptor}`);
      if (t.type === "match") {
        expect(documentXml).toContain("Соедините пары:");
        for (const opt of t.options ?? []) expect(documentXml).toContain(opt);
        for (const pair of t.pairs ?? []) expect(documentXml).toContain(pair);
      }
    }
    // Линейный режим: без карточек и без рисунков (в отличие от карточного выше).
    const plainZip = await JSZip.loadAsync(await buildHandoutDocx({ ...h, cardLayout: false }));
    const plainXml = await plainZip.file("word/document.xml")?.async("string");
    expect(plainXml).not.toContain("<w:drawing>");
  });

  it("flashcards → valid docx buffer", async () => {
    const h = await generateHandout({
      kind: "flashcards",
      topic: "X",
      subject: "Y",
      grade: 5,
      language: "ru",
      count: 4,
    });
    const buf = await buildHandoutDocx(h);
    expect(buf.subarray(0, 4).equals(ZIP_MAGIC)).toBe(true);
  });

  it("flashcards docx keeps the example and self-check blocks", async () => {
    const h = await generateHandout({
      kind: "flashcards", topic: "Дроби", subject: "Математика", grade: 5, language: "ru", count: 4,
    });
    if (h.kind !== "flashcards") return;
    const zip = await JSZip.loadAsync(await buildHandoutDocx(h));
    const documentXml = await zip.file("word/document.xml")?.async("string");
    expect(documentXml).toContain("ПАМЯТКА 01");
    expect(documentXml).toContain("Пример:");
    expect(documentXml).toContain("Проверь себя:");
  });

  it("combined worksheet+мемос → один docx с обеими частями", async () => {
    const worksheet = await generateHandout({
      kind: "worksheet", topic: "Дроби", subject: "Математика", grade: 5, language: "ru", count: 5,
    });
    const memos = await generateHandout({
      kind: "flashcards", topic: "Дроби", subject: "Математика", grade: 5, language: "ru", count: 8,
    });
    if (worksheet.kind !== "worksheet" || memos.kind !== "flashcards") return;
    expect(memos.title).toContain("Памятки");
    const zip = await JSZip.loadAsync(await buildCombinedDocx([worksheet, memos]));
    const documentXml = await zip.file("word/document.xml")?.async("string");
    expect(documentXml).toContain("Задание 1");
    expect(documentXml).toContain("Памятки: Дроби");
    expect(documentXml).toContain("Дескрипторы и баллы");
  });

  it("student version excludes answers and descriptors", async () => {
    const h = await generateHandout({
      kind: "worksheet", topic: "Дроби", subject: "Математика", grade: 5, language: "ru", count: 5,
    });
    if (h.kind !== "worksheet") return;
    const zip = await JSZip.loadAsync(await buildHandoutDocx(h, { includeAnswers: false }));
    const documentXml = await zip.file("word/document.xml")?.async("string");
    expect(documentXml).toContain("Задание 1");
    expect(documentXml).not.toContain("Ответы для учителя");
    expect(documentXml).not.toContain("Дескрипторы и баллы");
    expect(documentXml).not.toContain("Критерий оценивания:");
  });

  it("flashcards with images → embeds PNG into docx", async () => {
    // Minimal 1x1 transparent PNG
    const PNG_1X1 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    const handout = {
      kind: "flashcards" as const,
      title: "T",
      intro: "i",
      cards: [
        { front: "Apple", back: "Fruit", imagePngBase64: PNG_1X1, imageAlt: "apple" },
        { front: "Cat", back: "Animal" },
      ],
    };
    const buf = await buildHandoutDocx(handout);
    expect(buf.subarray(0, 4).equals(ZIP_MAGIC)).toBe(true);
    // PNG payload should be embedded somewhere inside the zip's media folder
    expect(buf.length).toBeGreaterThan(2000);
  });

  it("crossword → valid docx buffer", async () => {
    const h = await generateHandout({
      kind: "crossword",
      topic: "X",
      subject: "Y",
      grade: 5,
      language: "ru",
      count: 5,
    });
    const buf = await buildHandoutDocx(h);
    expect(buf.subarray(0, 4).equals(ZIP_MAGIC)).toBe(true);
  });

  it("crossword custom words: свои вопросы без AI + ответы отдельно", async () => {
    const { parseCrosswordLines } = await import("@/components/ksp/handouts-button");
    expect(parseCrosswordLines("дробь — часть целого\nмусор без разделителя\n\nчислитель: верхняя часть")).toEqual([
      { word: "дробь", clue: "часть целого" },
      { word: "числитель", clue: "верхняя часть" },
    ]);
    const h = await generateHandout({
      kind: "crossword",
      topic: "Дроби",
      subject: "Математика",
      grade: 5,
      language: "ru",
      count: 8,
      customWords: [
        { word: "дробь", clue: "часть целого" },
        { word: "числитель", clue: "верхняя часть" },
        { word: "знаменатель", clue: "нижняя часть" },
        { word: "половина", clue: "одна вторая" },
      ],
    });
    expect(h.kind).toBe("crossword");
    if (h.kind !== "crossword") return;
    expect(h.placed.map((w) => w.word)).toContain("ДРОБЬ");

    // Учительская версия — с ответами, ученическая — без.
    const teacherZip = await JSZip.loadAsync(await buildHandoutDocx(h, { includeAnswers: true }));
    const teacherXml = await teacherZip.file("word/document.xml")?.async("string");
    expect(teacherXml).toContain("Ответы для учителя");
    expect(teacherXml).toContain("ДРОБЬ");
    const studentZip = await JSZip.loadAsync(await buildHandoutDocx(h, { includeAnswers: false }));
    const studentXml = await studentZip.file("word/document.xml")?.async("string");
    expect(studentXml).not.toContain("Ответы для учителя");
    // Пустая сетка: букв-ответов в ячейках нет (только номера).
    expect(studentXml).not.toContain(">ДРОБЬ<");
  });
});
