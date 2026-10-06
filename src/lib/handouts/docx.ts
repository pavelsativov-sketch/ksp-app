import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  WidthType,
  PageNumber,
} from "docx";
import type { Crossword, Flashcard, FlashcardSet, Handout, Worksheet, WorksheetTask } from "./types";
import { optionLetter, worksheetAnswerLines, worksheetTypeLabel } from "./answers";
import { resolveErrorsCount, resolveTableRows } from "./layout";
// Пометка бесплатного тарифа строится здесь же (buildFreeWatermarkParagraphs):
// раньше она приходила из export/docx отдельным Footer, терялась при
// `footers: { default: footers[0] }` и вместе с ней исчезала защита биллинга.

/* ---------- Эталон РК: цветовая схема ---------- */
// Дизайн повторяет эталонный рабочий лист: голубые баннеры «Задание №N»,
// таблицы с тёмно-синей рамкой и цветной шапкой, персиковое облако-сценарий,
// кнопки-варианты ответа, блок «Ответы для учителя», рефлексия-смайлики.

const NAVY = "2B2D83"; // тёмно-синяя рамка и акцентный текст
const LIGHT_BLUE = "C9E7F5"; // голубой баннер «Задание №N»
const HEADER_BLUE = "3D6DB5"; // синяя шапка таблицы
const HEADER_GREY = "D9D9D9"; // серая шапка «Что сделано неправильно?»
const CLOUD_PEACH = "F6C89F"; // персиковое облако-сценарий
const BTN_BLUE = "3D6DB5"; // залитые кнопки-варианты
const WORD_BANK_GOLD = "FFF2CC"; // плашка «Слова для справок»
const GRADING_GREY = "E8EAF0"; // плашка ответов/дескрипторов
const REFLECT_GREEN = "E2EFDA"; // рефлексия «всё понял»
const REFLECT_BLUE = "DEEBF7"; // рефлексия «есть сомнения»
const REFLECT_RED = "FBE4E4"; // рефлексия «нужна помощь»
const MUTED = "595959";

const NAVY_BORDER = { style: BorderStyle.SINGLE, size: 12, color: NAVY };
const NAVY_BORDERS = { top: NAVY_BORDER, bottom: NAVY_BORDER, left: NAVY_BORDER, right: NAVY_BORDER };
const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: "666666" };
const THIN_BORDERS = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };
const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};
const CELL_MARGINS = { top: 100, bottom: 100, left: 160, right: 160 };
const FULL_WIDTH = { size: 100, type: WidthType.PERCENTAGE };

type WorksheetCopy = {
  task: string; points: string; studentLine: string; answers: string; descriptors: string;
  criterion: string; descriptor: string; total: string; wordBank: string; caseLabel: string;
  problem: string; solution: string; why: string; trueLabel: string; falseLabel: string;
  match: string; term: string; definition: string; error: string; correction: string;
  imageFailure: string; cutNote: string; across: string; down: string; extraWords: string;
  answer: string; findWords: string; qr: string; scan: string; teacherAdds: string; link: string; myResult: string;
  memo: string; example: string; selfCheck: string;
};

function worksheetCopy(language: "ru" | "kz" | undefined): WorksheetCopy {
  if (language === "kz") return {
    task: "Тапсырма", points: "б.", studentLine: "Оқушының аты-жөні: ____ Сынып: ____ Күні: ____",
    answers: "Мұғалімге арналған жауаптар", descriptors: "Дескрипторлар мен баллдар",
    criterion: "Бағалау критерийі", descriptor: "Дескриптор", total: "Барлығы",
    wordBank: "Таратылатын сөздер", caseLabel: "Жағдаят", problem: "Мәселе",
    solution: "Шешім", why: "Неліктен іске асады", trueLabel: "Дұрыс", falseLabel: "Бұрыс",
    match: "Сәйкестендіріңіз", term: "Термин", definition: "Анықтама",
    error: "Қате", correction: "Түзету",
    imageFailure: "Ескерту: ЖИ иллюстрациялары сұралды, бірақ кескіндер сервисі уақытша қолжетімсіз. Карточкалар суретсіз басып шығарылды.",
    cutNote: "Сызық бойымен қиып, ортасынан бүктеңіз. Бір бетінде термин, екінші бетінде анықтама.",
    across: "Көлденеңінен", down: "Тігінен", extraWords: "Қосымша сөздер (торға кірмеді)",
    answer: "Жауап", findWords: "Сөздерді тап", qr: "QR-код", scan: "сканерлеңіз", teacherAdds: "(мұғалім енгізеді)", link: "Сілтеме", myResult: "Менің нәтижем:",
    memo: "ЖАДНАМА", example: "Мысал", selfCheck: "Өзіңді тексер",
  };
  return {
    task: "Задание", points: "б.", studentLine: "ФИО ученика: ____ Класс: ____ Дата: ____",
    answers: "Ответы для учителя", descriptors: "Дескрипторы и баллы",
    criterion: "Критерий оценивания", descriptor: "Дескриптор", total: "Итого",
    wordBank: "Слова для распределения", caseLabel: "Кейс", problem: "Проблема",
    solution: "Решение", why: "Почему сработает", trueLabel: "Верно", falseLabel: "Неверно",
    match: "Соедините пары", term: "Термин", definition: "Определение",
    error: "Ошибка", correction: "Исправление",
    imageFailure: "Примечание: ИИ-иллюстрации запрошены, но сервис изображений временно недоступен — карточки напечатаны без рисунков.",
    cutNote: "Разрежьте по линиям, согните по середине. С одной стороны — термин, с другой — определение.",
    across: "По горизонтали", down: "По вертикали", extraWords: "Дополнительные слова (не вошли в сетку)",
    answer: "Ответ", findWords: "Найди слова", qr: "QR-код", scan: "сканируй", teacherAdds: "(вставит учитель)", link: "Ссылка", myResult: "Мой результат:",
    memo: "ПАМЯТКА", example: "Пример", selfCheck: "Проверь себя",
  };
}

export interface HandoutDocxOptions {
  language?: "ru" | "kz";
  watermark?: boolean;
  includeAnswers?: boolean;
  schoolName?: string;
  teacherName?: string;
  showPageNumbers?: boolean;
  showHeader?: boolean;
  showFooter?: boolean;
}

export async function buildHandoutDocx(h: Handout, options: HandoutDocxOptions = {}): Promise<Buffer> {
  return packChildren(handoutChildren(h, options.includeAnswers !== false), { ...options, language: h.language });
}

/**
 * Объединённый документ «Рабочий лист + Памятки»: задания, затем
 * памятки-карточки с новой страницы. Один файл для скачивания и печати.
 */
export async function buildCombinedDocx(
  parts: Handout[],
  options: { watermark?: boolean; includeAnswers?: boolean } = {},
): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];
  parts.forEach((part, i) => {
    if (i > 0) children.push(new Paragraph({ pageBreakBefore: true }));
    children.push(...handoutChildren(part, options.includeAnswers !== false));
  });
  const language = parts.length > 0 && parts.every((part) => part.language === "kz") ? "kz" : "ru";
  return packChildren(children, { ...options, language });
}

function handoutChildren(h: Handout, includeAnswers = true): (Paragraph | Table)[] {
  return h.kind === "worksheet"
    ? buildWorksheet(h, includeAnswers)
    : h.kind === "flashcards"
      ? buildFlashcards(h)
      : buildCrossword(h, includeAnswers);
}

async function packChildren(
  children: (Paragraph | Table)[],
  options: HandoutDocxOptions,
): Promise<Buffer> {
  const headers: Header[] = [];

  if (options.showHeader !== false) {
    const header = buildHandoutHeader(options.schoolName, options.teacherName, options.language);
    if (header) headers.push(header);
  }

  // Колонтитулы собираются в ОДИН Footer: раньше watermark и футер с
  // номерами страниц клались в массив, а в документ попадал только
  // footers[0]. При включённом футере (значение по умолчанию) пометка
  // «бесплатный тариф» молча терялась — то есть обходился биллинг.
  const footerParagraphs: Paragraph[] = [];
  if (options.showFooter !== false) {
    footerParagraphs.push(...buildHandoutFooterParagraphs(options.showPageNumbers !== false, options.language));
  }
  if (options.watermark) {
    footerParagraphs.push(...buildFreeWatermarkParagraphs());
  }
  const footers: Footer[] = footerParagraphs.length > 0 ? [new Footer({ children: footerParagraphs })] : [];

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 }, // 1.27 cm
          },
        },
        ...(headers.length > 0 ? { headers: { default: headers[0] } } : {}),
        ...(footers.length > 0 ? { footers: { default: footers[0] } } : {}),
        children,
      },
    ],
  });
  return await Packer.toBuffer(doc);
}

/**
 * Шапка документа с названием школы и именем учителя.
 *
 * Возвращает `undefined`, если данных нет: пустой Header всё равно попадает
 * в `word/header1.xml` и резервирует место в полях страницы (`w:header`).
 */
function buildHandoutHeader(schoolName?: string, teacherName?: string, language?: "ru" | "kz"): Header | undefined {
  const children: Paragraph[] = [];
  if (schoolName) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: schoolName, bold: true, size: 20, color: NAVY })],
    }));
  }
  if (teacherName) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `${language === "kz" ? "Мұғалім" : "Учитель"}: ${teacherName}`, size: 18, color: MUTED })],
    }));
  }
  if (children.length === 0) return undefined;
  return new Header({ children });
}

/** Абзацы подвала с номерами страниц. */
function buildHandoutFooterParagraphs(showPageNumbers: boolean, language?: "ru" | "kz"): Paragraph[] {
  const children: Paragraph[] = [];
  if (showPageNumbers) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: language === "kz" ? "Бет " : "Страница ", size: 16, color: MUTED }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED }),
        new TextRun({ text: language === "kz" ? " / " : " из ", size: 16, color: MUTED }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: MUTED }),
      ],
    }));
  }
  return children;
}

/** Абзацы пометки бесплатного тарифа. */
function buildFreeWatermarkParagraphs(): Paragraph[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "Создано в Mekty — бесплатный тариф",
          size: 14,
          color: MUTED,
          italics: true,
        }),
      ],
    }),
  ];
}

// ---------- Worksheet: лист в стиле эталона (по PDF) ----------

function buildWorksheet(w: Worksheet, includeAnswers = true): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const copy = worksheetCopy(w.language);
  // Header: Дата / ФИ (из metaLine, если задан)
  out.push(new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 200 },
    children: [
      new TextRun({ text: w.metaLine?.trim() ? w.metaLine : copy.studentLine, bold: true, size: 24 }),
    ]
  }));

  // Title + intro
  out.push(titleLine(w.title));
  if (w.intro?.trim()) {
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [new TextRun({ text: w.intro, italics: true, size: 20, color: MUTED })],
    }));
  }

  if (w.imagesFailed) out.push(imageFailureNote(copy));
  out.push(spacer());

  // Tasks in lesson order (no stage banners — clean sheet for printing).
  // creative выносим в финальную курсивную строку — как «Придумай пример
  // надёжного пароля: ____» в эталонных листах, поэтому здесь пропускаем.
  const closingPrompts = w.tasks
    .filter((task) => task.type === "creative")
    .map((task) => task.prompt)
    .filter((prompt) => prompt.trim().length > 0);
  w.tasks.forEach((task, index) => {
    if (task.type === "creative") return;
    out.push(...taskBlock(task, index + 1, includeAnswers, copy, w.language));
    out.push(spacer());
  });

  closingPrompts.forEach((prompt) => {
    out.push(closingTaskLine(prompt));
    out.push(spacer());
  });

  // Page break for teacher answers
  if (includeAnswers) {
    const answers = worksheetAnswerLines(w.tasks, w.language ?? "ru");
    if (answers.length > 0) {
      out.push(new Paragraph({ pageBreakBefore: true })); // Начинаем с новой страницы
      out.push(p(copy.answers, { bold: true, color: NAVY, size: 24 }));
      out.push(...teacherAnswersBlock(answers, copy));
      out.push(spacer());
    }

    // Descriptors table at the end
    out.push(p(copy.descriptors, { bold: true, color: NAVY }));
    out.push(descriptorTable(w, copy));
  }
  return out;
}

function titleLine(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [new TextRun({ text, bold: true, color: NAVY, size: 32 })],
  });
}

function imageFailureNote(copy: WorksheetCopy): Paragraph {
  return new Paragraph({
    spacing: { before: 80 },
    children: [
      new TextRun({
        text: copy.imageFailure,
        italics: true,
        color: "9B651F",
        size: 18,
      }),
    ],
  });
}

const CARD_BORDER = { style: BorderStyle.SINGLE, size: 6, color: "B9C6E4" };
const CARD_BORDERS = { top: CARD_BORDER, bottom: CARD_BORDER, left: CARD_BORDER, right: CARD_BORDER };
const CARD_MARGINS = { top: 160, bottom: 160, left: 200, right: 200 };

function taskBlock(t: WorksheetTask, index: number, includeAnswers: boolean, copy: WorksheetCopy, language?: "ru" | "kz"): (Paragraph | Table)[] {
  // Карточка задания: баннер + тело + критерии в рамке с отступами.
  const inner: (Paragraph | Table)[] = [taskBanner(index, t, copy, language)];

  // If task has image, put it in a two-column table if appropriate, else just stack
  const bodyItems = taskBody(t, index, copy);
  if (t.imageBase64) {
    const img = imageParagraph(t, 240, 180);
    if (img) {
      inner.push(
        new Table({
          width: FULL_WIDTH,
          borders: NO_BORDERS,
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 70, type: WidthType.PERCENTAGE },
                  children: bodyItems,
                }),
                new TableCell({
                  width: { size: 30, type: WidthType.PERCENTAGE },
                  children: [img],
                }),
              ],
            }),
          ],
        }),
      );
    } else {
      inner.push(...bodyItems);
    }
  } else {
    inner.push(...bodyItems);
  }

  // Критерий + дескриптор под заданием (мелким, как в эталоне) —
  // дублируются в сводной таблице в конце. В ученической версии скрываем.
  if (includeAnswers) inner.push(...descriptorLines(t, copy));

  return [
    new Table({
      width: FULL_WIDTH,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders: CARD_BORDERS,
              margins: CARD_MARGINS,
              children: inner,
            }),
          ],
        }),
      ],
    }),
  ];
}

/** Голубой баннер заголовка задания: «Задание N. Тип (X б.)». */
function taskBanner(index: number, t: WorksheetTask, copy: WorksheetCopy, language?: "ru" | "kz"): Paragraph {
  return new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: LIGHT_BLUE },
    spacing: { before: 120, after: 100 },
    children: [
      new TextRun({ text: `${copy.task} ${index}. ${worksheetTypeLabel(t.type, language ?? "ru")} (${t.points} ${copy.points})`, bold: true, color: NAVY, size: 22 }),
    ],
  });
}

function imageParagraph(t: WorksheetTask, width: number, height: number): Paragraph | null {
  const base64 = t.imageBase64;
  if (!base64) return null;
  try {
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new ImageRun({
          data: Buffer.from(base64, "base64"),
          transformation: { width, height },
          type: t.imageMime === "image/png" ? "png" : "jpg",
          altText: t.imageAlt ? { title: t.imageAlt, description: t.imageAlt, name: t.imageAlt } : undefined,
        }),
      ],
    });
  } catch {
    return null; // повреждённая картинка не должна ломать лист
  }
}

// ---------- Тела заданий ----------

function taskBody(t: WorksheetTask, index: number, copy: WorksheetCopy): (Paragraph | Table)[] {
  switch (t.type) {
    case "open":
      // Пронумерованные линии вместо пустых прочерков: ученику проще
      // соотнести ответ с вопросом, учителю — проверять.
      return [...promptParagraphs(t.prompt, index, t), ...numberedWriteLines(5)];
    case "fill":
      return [...promptParagraphs(t.prompt, index, t), writeLine(), writeLine()];
    case "fill_bank":
      return [...promptParagraphs(t.prompt, index, t), wordBankBox(t.wordBank ?? [], copy), writeLine(), writeLine()];
    case "sort":
      return [...promptParagraphs(t.prompt, index, t), sortItemsBox(t.items ?? [], copy), sortTable(t.groups, t.items ?? [], copy)];
    case "checklist":
      return [
        ...promptParagraphs(t.prompt, index, t),
        ...checklistParagraphs(t.options ?? []),
        ...numberedWriteLines(2),
      ];
    case "case_study":
      return [...promptParagraphs(t.prompt, index, t), caseCloud(t.situation ?? "", copy), writeLine(`${copy.problem}:`), writeLine(`${copy.solution}:`), writeLine(`${copy.why}:`)];
    case "multiple_choice":
      return [
        ...promptParagraphs(t.prompt, index, t),
        ...(t.options ?? []).map(
          (option, i) =>
            new Paragraph({
              spacing: { after: 40 },
              children: [new TextRun({ text: `☐ ${optionLetter(i)}) ${option}` })],
            }),
        ),
      ];
    case "true_false":
      return [...promptParagraphs(t.prompt, index, t), p(`☐ ${copy.trueLabel}        ☐ ${copy.falseLabel}`)];
    case "match":
      return [...promptParagraphs(t.prompt, index, t), p(`${copy.match}:`, { italics: true }), matchTable(t.options ?? [], t.pairs ?? [], copy)];
    case "table_fix":
      return [...promptParagraphs(t.prompt, index, t), tableFixBodyInner(t, copy)];
    case "scenario_fix":
      return [...promptParagraphs(t.prompt, index, t), scenarioTable(t, copy)];
    case "choice_buttons":
      return [...promptParagraphs(t.prompt, index, t), choiceButtons(t.choices ?? []), writeLine(`${copy.answer}:`)];
    case "reflection":
      return [...promptParagraphs(t.prompt, index, t), reflectionTable(t.reflectionOptions ?? [], copy)];
    case "interactive":
      return [
        ...promptParagraphs(t.prompt, index, t),
        new Table({
          width: FULL_WIDTH,
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  borders: THIN_BORDERS,
                  margins: CELL_MARGINS,
                  width: { size: 28, type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [new TextRun({ text: copy.qr, bold: true, size: 20, color: NAVY })],
                    }),
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [new TextRun({ text: t.link ? copy.scan : copy.teacherAdds, size: 16, color: MUTED })],
                    }),
                  ],
                }),
                new TableCell({
                  borders: THIN_BORDERS,
                  margins: CELL_MARGINS,
                  width: { size: 72, type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: t.link ? `${copy.link}: ${t.link}` : `${copy.link}: ___________________________ ${copy.teacherAdds}`, bold: Boolean(t.link), size: 18, color: NAVY })],
                    }),
                    new Paragraph({
                      spacing: { before: 120 },
                      border: { bottom: { style: BorderStyle.DASHED, size: 6, color: "808080", space: 2 } },
                      children: [new TextRun({ text: copy.myResult, size: 20, color: MUTED })],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ];
    case "creative":
      return [...promptParagraphs(t.prompt, index, t), writeLine(), writeLine(), writeLine()];
    case "word_search":
      return [...promptParagraphs(t.prompt, index, t), wordSearchGrid(t.searchWords ?? []), writeLine(`${copy.findWords}:`)];
    case "ordering":
      return [...promptParagraphs(t.prompt, index, t), orderingList(t.orderItems ?? []), writeLine(), writeLine()];
    case "odd_one_out":
      return [...promptParagraphs(t.prompt, index, t), oddOneOutItems(t.oddItems ?? []), writeLine(copy.error === "Қате" ? "Қай элемент артық? Неліктен?" : "Какой элемент лишний? Почему?")];
    case "categorize":
      return [...promptParagraphs(t.prompt, index, t), categorizeTable(t.categories ?? [], t.categoryItems ?? []), writeLine(), writeLine()];
  }
}

/** Текст задания построчно: переносы строк из AI печатаются как отдельные абзацы. */
function promptParagraphs(text: string, index: number, t: WorksheetTask): Paragraph[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  // Баннер «Задание N. Тип (баллы)» уже напечатан в taskBlock — здесь только текст.
  void index;
  void t;
  return lines.map((line, i) => {
    const children: TextRun[] = [];
    if (i === 0) {
      children.push(new TextRun({ text: line, bold: true, size: 24 }));
    } else {
      children.push(new TextRun({ text: line, size: 22 }));
    }
    return new Paragraph({
      spacing: { after: 80 },
      children,
    });
  });
}

/** Пунктирная линия для ответа ученика (как в эталоне). */
function writeLine(label = ""): Paragraph {
  return new Paragraph({
    spacing: { after: 140 },
    border: { bottom: { style: BorderStyle.DASHED, size: 6, color: "808080", space: 2 } },
    children: [new TextRun({ text: label ? `${label} ` : " ", size: 20, color: MUTED })],
  });
}

/** Плашка «Слова для справок» для заданий «Вставь пропущенные слова». */
function wordBankBox(words: string[], copy: WorksheetCopy): Table {
  const items = words.length > 0 ? words : ["—"];
  return new Table({
    width: FULL_WIDTH,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: THIN_BORDERS,
            shading: { type: ShadingType.CLEAR, fill: WORD_BANK_GOLD },
            margins: CELL_MARGINS,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: `${copy.wordBank}: `, bold: true, size: 20, color: NAVY }),
                  new TextRun({ text: items.join("  ·  "), size: 20 }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

/**
 * Плашка «Слова для распределения» для sort.
 *
 * Слова идут сплошным синим списком через тире — как в эталонных листах
 * учителей. Раньше были пронумерованы («1. … • 2. …»), из-за чего список
 * выглядел опросником, а не банком терминов для распределения.
 */
function sortItemsBox(items: string[], copy: WorksheetCopy): Table {
  const list = items.length > 0 ? items.join("  -  ") : "—";
  return new Table({
    width: FULL_WIDTH,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: THIN_BORDERS,
            shading: { type: ShadingType.CLEAR, fill: WORD_BANK_GOLD },
            margins: CELL_MARGINS,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: `${copy.wordBank}: `, bold: true, size: 20, color: NAVY }),
                  new TextRun({ text: list, size: 20, color: "1F4E9C" }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

/**
 * Таблица sort: две колонки-группы с высокими пустыми ячейками.
 *
 * Высота 1200 twips (~2 см) — в ячейке должно поместиться несколько
 * терминов, написанных от руки; прежние 480 были слишком мелкими, и лист
 * нельзя было заполнить. Шапки — только названия направлений, без «1./2.»:
 * нумерация колонок в эталонных листах не используется.
 */
function sortTable(groups: [string, string] | undefined, items: string[], copy: WorksheetCopy): Table {
  const headers: [string, string] = groups && groups[0] && groups[1]
    ? groups
    : copy.task === "Тапсырма" ? ["1-топ", "2-топ"] : ["Группа 1", "Группа 2"];
  const rows = Math.max(3, Math.min(8, Math.ceil(items.length / 4)));
  return new Table({
    width: FULL_WIDTH,
    rows: [
      new TableRow({ children: [headCell(headers[0], HEADER_BLUE, "FFFFFF"), headCell(headers[1], HEADER_BLUE, "FFFFFF")] }),
      ...Array.from(
        { length: rows },
        () => new TableRow({ height: { value: 1200, rule: "atLeast" }, children: [cell(""), cell("")] }),
      ),
    ],
  });
}

/**
 * Пронумерованные строки для письменного ответа («1 ______ 2 ______»).
 *
 * В эталонных листах задания «Отметь/перечисли» дают ученику номера и
 * линии, а не пустоту: так проще проверять и не нужно тянуть линейку.
 */
function numberedWriteLines(count: number, indent = 0): Paragraph[] {
  return Array.from({ length: Math.max(1, count) }, (_, i) => {
    const children: TextRun[] = [new TextRun({ text: `${i + 1} `, size: 22 })];
    if (indent > 0) {
      children[0] = new TextRun({ text: " ".repeat(indent) + `${i + 1} `, size: 22 });
    }
    return new Paragraph({
      spacing: { after: 160 },
      tabStops: [{ type: TabStopType.LEFT, position: 600 + indent * 60 }],
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "A6A6A6", space: 4 } },
      children: [...children, new TextRun({ text: "\t", size: 22 })],
    });
  });
}

/** Итоговая строка-задание курсивом: «Придумай пример надёжного пароля: ____». */
function closingTaskLine(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "9CC3E5", space: 4 } },
    children: [new TextRun({ text: `${text} `, italics: true, size: 22, color: "1F4E9C" })],
  });
}

/** Чек-лист: каждый пункт с квадратом ☐. */
function checklistParagraphs(options: string[]): Paragraph[] {
  const items = options.length > 0 ? options : ["—"];
  return items.map(
    (option) =>
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: `☐ ${option}`, size: 22 })],
      }),
  );
}

/** Персиковое облако для кейса (как scenario, но нейтральное). */
function caseCloud(situation: string, copy: WorksheetCopy): Table {
  const lines = situation.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  const cloud = lines.length > 0
    ? lines.map((line) => new Paragraph({ children: [new TextRun({ text: line, italics: true, size: 20, color: "7A3E12" })] }))
    : [new Paragraph({ children: [new TextRun({ text: "—", italics: true, size: 20, color: "7A3E12" })] })];
  return new Table({
    width: FULL_WIDTH,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: NO_BORDERS,
            shading: { type: ShadingType.CLEAR, fill: CLOUD_PEACH },
            margins: { top: 220, bottom: 220, left: 220, right: 220 },
            children: [
              new Paragraph({ children: [new TextRun({ text: `${copy.caseLabel}:`, bold: true, size: 20, color: "7A3E12" })] }),
              ...cloud,
            ],
          }),
        ],
      }),
    ],
  });
}
/** «Рассмотри рисунок»: только сама таблица исправлений (остальное делает taskBlock). */
function tableFixBodyInner(t: WorksheetTask, copy: WorksheetCopy): Table {
  const headers: [string, string] =
    t.tableHeaders && t.tableHeaders.length === 2 ? t.tableHeaders : [copy.error, copy.correction];
  const rows = resolveTableRows(t.tableRows);
  return fixTable(headers, rows);
}

// ---------- Таблицы и плашки эталона ----------

/** Сценарий-облако: слева строки «Ошибка N / Исправление», справа персиковое облако. */
function scenarioTable(t: WorksheetTask, copy: WorksheetCopy): Table {
  const count = resolveErrorsCount(t.errorsCount);
  const left: Paragraph[] = [];
  for (let n = 1; n <= count; n++) {
    left.push(new Paragraph({ spacing: { before: 40 }, children: [new TextRun({ text: `${copy.error} ${n}:`, bold: true, size: 20, color: NAVY })] }));
    left.push(writeLine());
    left.push(new Paragraph({ children: [new TextRun({ text: `${copy.correction}:`, bold: true, size: 20, color: NAVY })] }));
    left.push(writeLine());
  }
  const cloudLines = (t.situation ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const cloud = cloudLines.length > 0
    ? cloudLines.map((line) => new Paragraph({ children: [new TextRun({ text: line, italics: true, size: 20, color: "7A3E12" })] }))
    : [new Paragraph({ children: [new TextRun({ text: "—", italics: true, size: 20, color: "7A3E12" })] })];
  return new Table({
    width: FULL_WIDTH,
    rows: [
      new TableRow({
        children: [
          new TableCell({ borders: NO_BORDERS, width: { size: 54, type: WidthType.PERCENTAGE }, margins: CELL_MARGINS, children: left }),
          new TableCell({
            borders: NO_BORDERS,
            width: { size: 46, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: CLOUD_PEACH },
            margins: { top: 220, bottom: 220, left: 220, right: 220 },
            children: cloud,
          }),
        ],
      }),
    ],
  });
}

/** Кнопки-варианты: залитые синие прямоугольники с чекбоксом. */
function choiceButtons(choices: string[]): Table {
  const items = choices.length > 0 ? choices : ["№1", "№2", "№3"];
  const width = Math.floor(100 / items.length);
  return new Table({
    width: FULL_WIDTH,
    rows: [
      new TableRow({
        children: items.map(
          (choice) =>
            new TableCell({
              borders: NAVY_BORDERS,
              shading: { type: ShadingType.CLEAR, fill: BTN_BLUE },
              margins: CELL_MARGINS,
              width: { size: width, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: `☐ ${choice}`, bold: true, color: "FFFFFF", size: 22 })],
                }),
              ],
            }),
        ),
      }),
    ],
  });
}

/** Рефлексия: три цветные кнопки-смайлика (зелёный / синий / красный). */
function reflectionTable(options: string[], copy: WorksheetCopy): Table {
  const labels = options.length === 3 ? options : copy.task === "Тапсырма" ? ["Барлығын түсіндім", "Сұрағым бар", "Көмек керек"] : ["Всё понял(а)", "Есть сомнения", "Нужна помощь"];
  const fills = [REFLECT_GREEN, REFLECT_BLUE, REFLECT_RED];
  return new Table({
    width: FULL_WIDTH,
    rows: [
      new TableRow({
        height: { value: 560, rule: "atLeast" },
        children: labels.map(
          (label, i) =>
            new TableCell({
              borders: THIN_BORDERS,
              shading: { type: ShadingType.CLEAR, fill: fills[i] ?? REFLECT_GREEN },
              margins: CELL_MARGINS,
              width: { size: Math.floor(100 / labels.length), type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: `☐ ${label}`, size: 20 })],
                }),
              ],
            }),
        ),
      }),
    ],
  });
}

/** Таблица «Что сделано неправильно? / Как исправить?» с пустыми строками. */
function fixTable(headers: [string, string], rowCount: number): Table {
  return new Table({
    width: FULL_WIDTH,
    rows: [
      new TableRow({ children: [headCell(headers[0], HEADER_GREY), headCell(headers[1], HEADER_GREY)] }),
      ...Array.from(
        { length: rowCount },
        () => new TableRow({ height: { value: 620, rule: "atLeast" }, children: [cell(""), cell("")] }),
      ),
    ],
  });
}

function headCell(text: string, fill: string, color = NAVY): TableCell {
  return new TableCell({
    borders: NAVY_BORDERS,
    shading: { type: ShadingType.CLEAR, fill },
    margins: CELL_MARGINS,
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, color })] }),
    ],
  });
}

function matchTable(left: string[], right: string[], copy: WorksheetCopy): Table {
  const max = Math.max(left.length, right.length);
  const rows: TableRow[] = [
    new TableRow({ children: [headCell(copy.term, HEADER_BLUE, "FFFFFF"), headCell(copy.definition, HEADER_BLUE, "FFFFFF")] }),
  ];
  for (let i = 0; i < max; i++) {
    rows.push(new TableRow({ height: { value: 480, rule: "atLeast" }, children: [cell(left[i] ?? ""), cell(right[i] ?? "")] }));
  }
  return new Table({ rows, width: FULL_WIDTH });
}

/** Блок «Ответы для учителя» — ключи к заданиям с баллами. */
function teacherAnswersBlock(lines: string[], copy: WorksheetCopy): (Paragraph | Table)[] {
  return [
    p(copy.answers, { bold: true, color: NAVY }),
    new Table({
      width: FULL_WIDTH,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders: THIN_BORDERS,
              shading: { type: ShadingType.CLEAR, fill: GRADING_GREY },
              margins: CELL_MARGINS,
              children: lines.map(
                (line) => new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: line, size: 18 })] }),
              ),
            }),
          ],
        }),
      ],
    }),
  ];
}

function descriptorLines(t: WorksheetTask, copy: WorksheetCopy): Paragraph[] {
  return [
    new Paragraph({
      spacing: { before: 60 },
      children: [new TextRun({ text: `${copy.criterion}: ${t.criterion}`, size: 16, italics: true, color: MUTED })],
    }),
    new Paragraph({
      children: [new TextRun({ text: `${copy.descriptor}: ${t.descriptor}`, size: 16, italics: true, color: MUTED })],
    }),
  ];
}

function descriptorTable(w: Worksheet, copy: WorksheetCopy): Table {
  const rows = [
    new TableRow({ children: [headCell(copy.task, HEADER_BLUE, "FFFFFF"), headCell(copy.criterion, HEADER_BLUE, "FFFFFF"), headCell(copy.descriptor, HEADER_BLUE, "FFFFFF"), headCell(copy.points, HEADER_BLUE, "FFFFFF")] }),
    ...w.tasks.map(
      (task, index) =>
        new TableRow({ children: [cell(`${copy.task} ${index + 1}`), cell(task.criterion), cell(task.descriptor), cell(String(task.points))] }),
    ),
    new TableRow({
      children: [
        cell(copy.total, { bold: true }),
        cell(""),
        cell(""),
        cell(String(w.tasks.reduce((sum, task) => sum + task.points, 0)), { bold: true }),
      ],
    }),
  ];
  return new Table({ rows, width: FULL_WIDTH });
}

function cell(text: string, opts?: { bold?: boolean }): TableCell {
  return new TableCell({
    borders: NAVY_BORDERS,
    margins: CELL_MARGINS,
    children: [new Paragraph({ children: [new TextRun({ text, bold: opts?.bold })] })],
  });
}

// ---------- Flashcards ----------

function buildFlashcards(f: FlashcardSet): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const copy = worksheetCopy(f.language);
  out.push(heading(f.title));
  if (f.intro) out.push(p(f.intro));
  if (f.imagesFailed) out.push(imageFailureNote(copy));
  out.push(spacer());

  // 2 columns × N rows. Каждая ячейка — одна карточка (front, разделитель, back).
  const rows: TableRow[] = [];
  for (let i = 0; i < f.cards.length; i += 2) {
    const left = f.cards[i];
    const right = f.cards[i + 1];
    rows.push(
      new TableRow({
        children: [flashCell(left, copy, i), flashCell(right, copy, i + 1)],
        height: { value: 2400, rule: "atLeast" },
      }),
    );
  }
  out.push(new Table({ rows, width: FULL_WIDTH }));
  out.push(spacer());
  out.push(p(copy.cutNote, { italics: true }));
  return out;
}

function flashCell(card: Flashcard | undefined, copy: WorksheetCopy, index: number): TableCell {
  if (!card) return cell("");
  const children: Paragraph[] = [];
  const base64 = card.imageBase64;
  if (base64) {
    try {
      const data = Buffer.from(base64, "base64");
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data,
              transformation: { width: 112, height: 112 },
              type: card.imageMime === "image/png" ? "png" : "jpg",
              altText: card.imageAlt
                ? { title: card.imageAlt, description: card.imageAlt, name: card.imageAlt }
                : undefined,
            }),
          ],
        }),
      );
    } catch {
      // ignore broken image
    }
  }
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: `${copy.memo} ${String(index + 1).padStart(2, "0")}`, bold: true, size: 16, color: NAVY })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: card.front, bold: true, size: 28, color: NAVY })],
    }),
    new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: card.back, size: 18 })],
    }),
  );
  if (card.example) {
    children.push(new Paragraph({
      spacing: { before: 40, after: 70 },
      children: [
        new TextRun({ text: `${copy.example}: `, bold: true, size: 16, color: NAVY }),
        new TextRun({ text: card.example, size: 16 }),
      ],
    }));
  }
  if (card.checkQuestion) {
    children.push(new Paragraph({
      border: { top: { style: BorderStyle.DASHED, size: 4, color: "A6A6A6", space: 3 } },
      children: [
        new TextRun({ text: `✦ ${copy.selfCheck}: `, bold: true, size: 16, color: NAVY }),
        new TextRun({ text: card.checkQuestion, size: 16 }),
      ],
    }));
  }
  return new TableCell({
    borders: THIN_BORDERS,
    width: { size: 50, type: WidthType.PERCENTAGE },
    margins: CELL_MARGINS,
    children,
  });
}

// ---------- Crossword ----------

function buildCrossword(c: Crossword, includeAnswers = true): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const copy = worksheetCopy(c.language);
  out.push(heading(c.title));
  if (c.intro) out.push(p(c.intro));
  out.push(spacer());

  if (c.grid.length > 0) {
    // numbers map for quick lookup
    const numAt = new Map<string, number>();
    for (const n of c.numbers) numAt.set(`${n.row},${n.col}`, n.number);

    const rows: TableRow[] = [];
    for (let r = 0; r < c.grid.length; r++) {
      const cells: TableCell[] = [];
      for (let cIdx = 0; cIdx < c.grid[0].length; cIdx++) {
        const ch = c.grid[r][cIdx];
        const num = numAt.get(`${r},${cIdx}`);
        if (ch === null) {
          cells.push(
            new TableCell({
              width: { size: 600, type: WidthType.DXA }, // ~1.05cm
              borders: NO_BORDERS,
              shading: { fill: "FFFFFF" },
              children: [new Paragraph("")],
            }),
          );
        } else {
          cells.push(
            new TableCell({
              borders: THIN_BORDERS,
              width: { size: 600, type: WidthType.DXA },
              children: [
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  children: num
                    ? [new TextRun({ text: String(num), size: 14, superScript: true })]
                    : [new TextRun({ text: " " })],
                }),
              ],
            }),
          );
        }
      }
      rows.push(new TableRow({ children: cells, height: { value: 600, rule: "atLeast" } }));
    }
    out.push(new Table({ rows }));
    out.push(spacer());
  }

  // Подсказки
  const across = c.placed.filter((x) => x.direction === "across");
  const down = c.placed.filter((x) => x.direction === "down");
  if (across.length) {
    out.push(p(`${copy.across}:`, { bold: true }));
    for (const w of across) out.push(p(`${w.number}. ${w.clue}`));
  }
  if (down.length) {
    out.push(p(`${copy.down}:`, { bold: true }));
    for (const w of down) out.push(p(`${w.number}. ${w.clue}`));
  }
  if (c.unplaced.length) {
    out.push(spacer());
    out.push(p(`${copy.extraWords}:`, { italics: true }));
    for (const w of c.unplaced) out.push(p(`• ${w.clue} — (${w.word.length} букв)`));
  }
  if (includeAnswers && c.placed.length) {
    out.push(new Paragraph({ pageBreakBefore: true }));
    out.push(p(copy.answers, { bold: true, color: NAVY, size: 24 }));
    for (const w of c.placed) out.push(p(`${w.number}. ${w.word} — ${w.clue}`));
  }
  return out;
}

// ---------- Новые типы заданий ----------

/** Сетка для поиска слов: буквы в таблице. */
function wordSearchGrid(words: string[]): Table {
  const size = Math.max(8, Math.ceil(Math.sqrt(words.join("").length)) + 2);
  const grid: string[][] = Array.from({ length: size }, () => Array(size).fill(""));
  
  // Простая раскладка: слова по горизонтали в случайных местах
  let wordIndex = 0;
  for (const word of words) {
    if (wordIndex >= size) break;
    const row = wordIndex;
    const startCol = Math.floor((size - word.length) / 2);
    for (let i = 0; i < word.length && startCol + i < size; i++) {
      grid[row][startCol + i] = word[i];
    }
    wordIndex++;
  }
  
  // Заполняем пустые клетки случайными буквами
  const letters = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!grid[r][c]) {
        grid[r][c] = letters[Math.floor(Math.random() * letters.length)];
      }
    }
  }
  
  const rows: TableRow[] = grid.map((row) =>
    new TableRow({
      children: row.map(
        (letter) =>
          new TableCell({
            borders: THIN_BORDERS,
            width: { size: Math.floor(100 / size), type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: letter, size: 20 })],
              }),
            ],
          }),
      ),
    }),
  );
  return new Table({ rows, width: FULL_WIDTH });
}

/** Список элементов для упорядочивания. */
function orderingList(items: string[]): Table {
  const rows: TableRow[] = items.map(
    (item, i) =>
      new TableRow({
        children: [
          new TableCell({
            borders: THIN_BORDERS,
            width: { size: 10, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${i + 1}.`, bold: true, size: 20, color: NAVY })] })],
          }),
          new TableCell({
            borders: THIN_BORDERS,
            width: { size: 90, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: item, size: 20 })] })],
          }),
        ],
      }),
  );
  return new Table({ rows, width: FULL_WIDTH });
}

/** Элементы для задания «Найди лишнее». */
function oddOneOutItems(items: string[]): Table {
  const rows: TableRow[] = items.map(
    (item, i) =>
      new TableRow({
        children: [
          new TableCell({
            borders: THIN_BORDERS,
            width: { size: 10, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: optionLetter(i), bold: true, size: 20, color: NAVY })] })],
          }),
          new TableCell({
            borders: THIN_BORDERS,
            width: { size: 90, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: item, size: 20 })] })],
          }),
        ],
      }),
  );
  return new Table({ rows, width: FULL_WIDTH });
}

/** Таблица для классификации по категориям. */
function categorizeTable(categories: string[], items: string[]): Table {
  const headers = categories.length > 0 ? categories : ["Категория 1", "Категория 2"];
  const rows: TableRow[] = [
    new TableRow({
      children: headers.map((h) => headCell(h, HEADER_BLUE, "FFFFFF")),
    }),
  ];
  const itemsPerCategory = Math.ceil(items.length / headers.length);
  for (let i = 0; i < itemsPerCategory; i++) {
    rows.push(
      new TableRow({
        children: headers.map((_, ci) => {
          const item = items[i * headers.length + ci] ?? "";
          return cell(item);
        }),
      }),
    );
  }
  return new Table({ rows, width: FULL_WIDTH });
}

// ---------- helpers ----------

function p(text: string, opts?: { bold?: boolean; italics?: boolean; color?: string; size?: number }): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: opts?.bold, italics: opts?.italics, color: opts?.color, size: opts?.size })],
  });
}

function heading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, bold: true })],
  });
}

function spacer(): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: "" })] });
}





