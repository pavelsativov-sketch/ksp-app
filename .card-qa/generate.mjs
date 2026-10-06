// .card-qa/generate.ts
import { writeFileSync } from "node:fs";

// src/lib/handouts/docx.ts
import {
  AlignmentType as AlignmentType2,
  BorderStyle as BorderStyle2,
  Document as Document2,
  Footer as Footer2,
  Header,
  HeadingLevel as HeadingLevel2,
  ImageRun,
  Packer as Packer2,
  Paragraph as Paragraph2,
  ShadingType,
  Table as Table2,
  TableCell as TableCell2,
  TableRow as TableRow2,
  TabStopType,
  TextRun as TextRun2,
  WidthType as WidthType2,
  PageNumber
} from "docx";

// src/lib/handouts/answers.ts
var WORKSHEET_TYPE_LABEL = {
  open: "\u041E\u0442\u043A\u0440\u044B\u0442\u044B\u0439 \u0432\u043E\u043F\u0440\u043E\u0441",
  fill: "\u0417\u0430\u043F\u043E\u043B\u043D\u0438 \u043F\u0440\u043E\u043F\u0443\u0441\u043A\u0438",
  fill_bank: "\u0412\u0441\u0442\u0430\u0432\u044C \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u043D\u044B\u0435 \u0441\u043B\u043E\u0432\u0430",
  multiple_choice: "\u0412\u044B\u0431\u0435\u0440\u0438 \u043E\u0434\u0438\u043D \u0432\u0430\u0440\u0438\u0430\u043D\u0442 \u043E\u0442\u0432\u0435\u0442\u0430",
  match: "\u0421\u043E\u0435\u0434\u0438\u043D\u0438 \u043F\u0430\u0440\u044B",
  true_false: "\u0412\u0435\u0440\u043D\u043E \u0438\u043B\u0438 \u043D\u0435\u0432\u0435\u0440\u043D\u043E",
  sort: "\u0420\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0438 \u043F\u043E \u0433\u0440\u0443\u043F\u043F\u0430\u043C",
  checklist: "\u041E\u0442\u043C\u0435\u0442\u044C \u0432\u0435\u0440\u043D\u044B\u0435 \u0443\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F",
  case_study: "\u0420\u0430\u0437\u0431\u0435\u0440\u0438 \u043A\u0435\u0439\u0441",
  table_fix: "\u0420\u0430\u0441\u0441\u043C\u043E\u0442\u0440\u0438 \u0438 \u0438\u0441\u043F\u0440\u0430\u0432\u044C",
  scenario_fix: "\u041D\u0430\u0439\u0434\u0438 \u043E\u0448\u0438\u0431\u043A\u0438 \u0438 \u0438\u0441\u043F\u0440\u0430\u0432\u044C",
  choice_buttons: "\u0412\u044B\u0431\u0435\u0440\u0438 \u043B\u0443\u0447\u0448\u0438\u0439 \u0432\u0430\u0440\u0438\u0430\u043D\u0442",
  reflection: "\u0420\u0435\u0444\u043B\u0435\u043A\u0441\u0438\u044F",
  interactive: "\u0418\u043D\u0442\u0435\u0440\u0430\u043A\u0442\u0438\u0432 (QR / \u0441\u0441\u044B\u043B\u043A\u0430)",
  creative: "\u0422\u0432\u043E\u0440\u0447\u0435\u0441\u043A\u043E\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u0435",
  word_search: "\u041D\u0430\u0439\u0434\u0438 \u0441\u043B\u043E\u0432\u0430",
  ordering: "\u0423\u043F\u043E\u0440\u044F\u0434\u043E\u0447\u0438 \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u044B",
  odd_one_out: "\u041D\u0430\u0439\u0434\u0438 \u043B\u0438\u0448\u043D\u0435\u0435",
  categorize: "\u041A\u043B\u0430\u0441\u0441\u0438\u0444\u0438\u0446\u0438\u0440\u0443\u0439"
};
var WORKSHEET_TYPE_LABEL_KZ = {
  open: "\u0410\u0448\u044B\u049B \u0441\u04B1\u0440\u0430\u049B",
  fill: "\u0411\u043E\u0441 \u043E\u0440\u044B\u043D\u0434\u044B \u0442\u043E\u043B\u0442\u044B\u0440",
  fill_bank: "\u0422\u0438\u0456\u0441\u0442\u0456 \u0441\u04E9\u0437\u0434\u0435\u0440\u0434\u0456 \u049B\u043E\u0439",
  multiple_choice: "\u0411\u0456\u0440 \u0434\u04B1\u0440\u044B\u0441 \u0436\u0430\u0443\u0430\u043F\u0442\u044B \u0442\u0430\u04A3\u0434\u0430",
  match: "\u0421\u04D9\u0439\u043A\u0435\u0441\u0442\u0435\u043D\u0434\u0456\u0440",
  true_false: "\u0414\u04B1\u0440\u044B\u0441 \u043D\u0435\u043C\u0435\u0441\u0435 \u0431\u04B1\u0440\u044B\u0441",
  sort: "\u0422\u043E\u043F\u0442\u0430\u0440\u0493\u0430 \u0431\u04E9\u043B",
  checklist: "\u0414\u04B1\u0440\u044B\u0441 \u0442\u04B1\u0436\u044B\u0440\u044B\u043C\u0434\u0430\u0440\u0434\u044B \u0431\u0435\u043B\u0433\u0456\u043B\u0435",
  case_study: "\u0416\u0430\u0493\u0434\u0430\u044F\u0442\u0442\u044B \u0442\u0430\u043B\u0434\u0430",
  table_fix: "\u049A\u0430\u0442\u0435\u043D\u0456 \u0442\u0430\u0443\u044B\u043F, \u0442\u04AF\u0437\u0435\u0442",
  scenario_fix: "\u049A\u0430\u0442\u0435\u043B\u0435\u0440\u0434\u0456 \u0442\u0430\u0443\u044B\u043F, \u0442\u04AF\u0437\u0435\u0442",
  choice_buttons: "\u0415\u04A3 \u0434\u04B1\u0440\u044B\u0441 \u043D\u04B1\u0441\u049B\u0430\u043D\u044B \u0442\u0430\u04A3\u0434\u0430",
  reflection: "\u0420\u0435\u0444\u043B\u0435\u043A\u0441\u0438\u044F",
  interactive: "\u0418\u043D\u0442\u0435\u0440\u0430\u043A\u0442\u0438\u0432\u0442\u0456 \u0442\u0430\u043F\u0441\u044B\u0440\u043C\u0430",
  creative: "\u0428\u044B\u0493\u0430\u0440\u043C\u0430\u0448\u044B\u043B\u044B\u049B \u0442\u0430\u043F\u0441\u044B\u0440\u043C\u0430",
  word_search: "\u0421\u04E9\u0437\u0434\u0435\u0440\u0434\u0456 \u0442\u0430\u043F",
  ordering: "\u0420\u0435\u0442\u0456\u043D \u0430\u043D\u044B\u049B\u0442\u0430",
  odd_one_out: "\u0410\u0440\u0442\u044B\u049B \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u0442\u0456 \u0442\u0430\u043F",
  categorize: "\u0422\u043E\u043F\u0442\u0430\u0441\u0442\u044B\u0440"
};
function worksheetTypeLabel(type, language = "ru") {
  const labels = language === "kz" ? WORKSHEET_TYPE_LABEL_KZ : WORKSHEET_TYPE_LABEL;
  return labels[type] ?? (language === "kz" ? "\u0422\u0430\u043F\u0441\u044B\u0440\u043C\u0430" : "\u0417\u0430\u0434\u0430\u043D\u0438\u0435");
}
var OPTION_LETTERS = "\u0410\u0411\u0412\u0413\u0414\u0415";
function optionLetter(index) {
  return OPTION_LETTERS[index] ?? String(index + 1);
}
function worksheetAnswerLines(tasks, language = "ru") {
  const lines = [];
  tasks.forEach((task, index) => {
    const answers = [];
    switch (task.type) {
      case "multiple_choice": {
        const correct = task.correctIndex ?? 0;
        const option = task.options?.[correct];
        if (option) answers.push(`${optionLetter(correct)}) ${option}`);
        break;
      }
      case "true_false":
        answers.push(task.correctIndex === 1 ? language === "kz" ? "\u0411\u04B1\u0440\u044B\u0441" : "\u041D\u0435\u0432\u0435\u0440\u043D\u043E" : language === "kz" ? "\u0414\u04B1\u0440\u044B\u0441" : "\u0412\u0435\u0440\u043D\u043E");
        break;
      case "match": {
        const left = task.options ?? [];
        const right = task.pairs ?? [];
        for (let i = 0; i < Math.min(left.length, right.length); i++) {
          answers.push(`${i + 1} \u2014 ${optionLetter(i)}`);
        }
        if (task.expectedAnswer) answers.push(task.expectedAnswer);
        break;
      }
      case "sort": {
        if (task.expectedAnswer) answers.push(task.expectedAnswer);
        else if (task.groups && task.items) {
          answers.push(`${task.groups[0]} / ${task.groups[1]}: ${language === "kz" ? "\u0436\u0430\u0443\u0430\u043F \u043A\u0456\u043B\u0442\u0456\u043D \u049B\u0430\u0440\u0430\u04A3\u044B\u0437" : "\u0441\u043C. \u043A\u043B\u044E\u0447"}`);
        }
        break;
      }
      case "checklist": {
        const opts = task.options ?? [];
        const flags = task.correctFlags ?? [];
        const marked = opts.filter((_, i) => flags[i]).map((o) => `\u2713 ${o}`);
        if (marked.length > 0) answers.push(marked.join("; "));
        if (task.expectedAnswer) answers.push(task.expectedAnswer);
        break;
      }
      case "case_study": {
        if (task.expectedAnswer) answers.push(task.expectedAnswer);
        else if (task.situation) answers.push(language === "kz" ? "\u0416\u0430\u0493\u0434\u0430\u044F\u0442 \u0442\u0430\u043B\u0434\u0430\u0443\u044B\u043D \u049B\u0430\u0440\u0430\u04A3\u044B\u0437" : "\u0421\u043C. \u0440\u0430\u0437\u0431\u043E\u0440 \u043A\u0435\u0439\u0441\u0430");
        break;
      }
      case "choice_buttons": {
        const correct = task.correctChoice;
        if (typeof correct === "number" && task.choices?.[correct]) answers.push(task.choices[correct]);
        if (task.expectedAnswer) answers.push(task.expectedAnswer);
        break;
      }
      case "reflection":
        break;
      case "interactive":
        if (task.link) answers.push(task.link);
        if (task.expectedAnswer) answers.push(task.expectedAnswer);
        break;
      case "creative":
        if (task.expectedAnswer) answers.push(task.expectedAnswer);
        break;
      case "word_search":
        if (task.searchWords) answers.push(`${language === "kz" ? "\u0421\u04E9\u0437\u0434\u0435\u0440" : "\u0421\u043B\u043E\u0432\u0430"}: ${task.searchWords.join(", ")}`);
        if (task.expectedAnswer) answers.push(task.expectedAnswer);
        break;
      case "ordering":
        if (task.orderItems) answers.push(`${language === "kz" ? "\u0420\u0435\u0442\u0456" : "\u041F\u043E\u0440\u044F\u0434\u043E\u043A"}: ${task.orderItems.join(" \u2192 ")}`);
        if (task.expectedAnswer) answers.push(task.expectedAnswer);
        break;
      case "odd_one_out": {
        const oddItem = task.oddItems?.[task.oddIndex ?? 0];
        if (oddItem) answers.push(`${language === "kz" ? "\u0410\u0440\u0442\u044B\u049B \u044D\u043B\u0435\u043C\u0435\u043D\u0442" : "\u041B\u0438\u0448\u043D\u0435\u0435"}: ${oddItem}`);
        if (task.oddReason) answers.push(`${language === "kz" ? "\u0421\u0435\u0431\u0435\u0431\u0456" : "\u041F\u0440\u0438\u0447\u0438\u043D\u0430"}: ${task.oddReason}`);
        if (task.expectedAnswer) answers.push(task.expectedAnswer);
        break;
      }
      case "categorize":
        if (task.categories && task.categoryItems) {
          answers.push(`${language === "kz" ? "\u0421\u0430\u043D\u0430\u0442\u0442\u0430\u0440" : "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438"}: ${task.categories.join(", ")}`);
          answers.push(`${language === "kz" ? "\u042D\u043B\u0435\u043C\u0435\u043D\u0442\u0442\u0435\u0440" : "\u042D\u043B\u0435\u043C\u0435\u043D\u0442\u044B"}: ${task.categoryItems.join(", ")}`);
        }
        if (task.expectedAnswer) answers.push(task.expectedAnswer);
        break;
      default:
        if (task.expectedAnswer) answers.push(task.expectedAnswer);
    }
    if (answers.length > 0) lines.push(`${language === "kz" ? "\u0422\u0430\u043F\u0441\u044B\u0440\u043C\u0430" : "\u0417\u0430\u0434\u0430\u043D\u0438\u0435"} ${index + 1} (${task.points} ${language === "kz" ? "\u0431." : "\u0431."}): ${answers.join("; ")}`);
  });
  return lines;
}

// src/lib/handouts/layout.ts
var DEFAULT_TABLE_ROWS = 4;
var MIN_TABLE_ROWS = 2;
var MAX_TABLE_ROWS = 8;
var DEFAULT_ERRORS_COUNT = 3;
var MIN_ERRORS_COUNT = 1;
var MAX_ERRORS_COUNT = 6;
function clamp(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}
function resolveTableRows(value) {
  return clamp(value ?? DEFAULT_TABLE_ROWS, MIN_TABLE_ROWS, MAX_TABLE_ROWS, DEFAULT_TABLE_ROWS);
}
function resolveErrorsCount(value) {
  return clamp(value ?? DEFAULT_ERRORS_COUNT, MIN_ERRORS_COUNT, MAX_ERRORS_COUNT, DEFAULT_ERRORS_COUNT);
}

// src/lib/export/docx.ts
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  TextRun,
  AlignmentType,
  WidthType,
  BorderStyle,
  Footer
} from "docx";
var BORDER = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: "666666"
};
function buildFreeWatermarkFooter() {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: "\u0421\u043E\u0437\u0434\u0430\u043D\u043E \u0432 Mekty \u2014 \u0431\u0435\u0441\u043F\u043B\u0430\u0442\u043D\u044B\u0439 \u0442\u0430\u0440\u0438\u0444 \xB7 \u0443\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u043E\u043C\u0435\u0442\u043A\u0443 \u0441 Pro: mekty.kz",
            size: 16,
            color: "999999"
          })
        ]
      })
    ]
  });
}

// src/lib/handouts/docx.ts
var NAVY = "2B2D83";
var LIGHT_BLUE = "C9E7F5";
var HEADER_BLUE = "3D6DB5";
var HEADER_GREY = "D9D9D9";
var CLOUD_PEACH = "F6C89F";
var BTN_BLUE = "3D6DB5";
var WORD_BANK_GOLD = "FFF2CC";
var GRADING_GREY = "E8EAF0";
var REFLECT_GREEN = "E2EFDA";
var REFLECT_BLUE = "DEEBF7";
var REFLECT_RED = "FBE4E4";
var MUTED = "595959";
var NAVY_BORDER = { style: BorderStyle2.SINGLE, size: 12, color: NAVY };
var NAVY_BORDERS = { top: NAVY_BORDER, bottom: NAVY_BORDER, left: NAVY_BORDER, right: NAVY_BORDER };
var THIN_BORDER = { style: BorderStyle2.SINGLE, size: 4, color: "666666" };
var THIN_BORDERS = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };
var NO_BORDERS = {
  top: { style: BorderStyle2.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle2.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle2.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle2.NONE, size: 0, color: "FFFFFF" }
};
var CELL_MARGINS = { top: 100, bottom: 100, left: 160, right: 160 };
var FULL_WIDTH = { size: 100, type: WidthType2.PERCENTAGE };
function worksheetCopy(language) {
  if (language === "kz") return {
    task: "\u0422\u0430\u043F\u0441\u044B\u0440\u043C\u0430",
    points: "\u0431.",
    studentLine: "\u041E\u049B\u0443\u0448\u044B\u043D\u044B\u04A3 \u0430\u0442\u044B-\u0436\u04E9\u043D\u0456: ____ \u0421\u044B\u043D\u044B\u043F: ____ \u041A\u04AF\u043D\u0456: ____",
    answers: "\u041C\u04B1\u0493\u0430\u043B\u0456\u043C\u0433\u0435 \u0430\u0440\u043D\u0430\u043B\u0493\u0430\u043D \u0436\u0430\u0443\u0430\u043F\u0442\u0430\u0440",
    descriptors: "\u0414\u0435\u0441\u043A\u0440\u0438\u043F\u0442\u043E\u0440\u043B\u0430\u0440 \u043C\u0435\u043D \u0431\u0430\u043B\u043B\u0434\u0430\u0440",
    criterion: "\u0411\u0430\u0493\u0430\u043B\u0430\u0443 \u043A\u0440\u0438\u0442\u0435\u0440\u0438\u0439\u0456",
    descriptor: "\u0414\u0435\u0441\u043A\u0440\u0438\u043F\u0442\u043E\u0440",
    total: "\u0411\u0430\u0440\u043B\u044B\u0493\u044B",
    wordBank: "\u0422\u0430\u0440\u0430\u0442\u044B\u043B\u0430\u0442\u044B\u043D \u0441\u04E9\u0437\u0434\u0435\u0440",
    caseLabel: "\u0416\u0430\u0493\u0434\u0430\u044F\u0442",
    problem: "\u041C\u04D9\u0441\u0435\u043B\u0435",
    solution: "\u0428\u0435\u0448\u0456\u043C",
    why: "\u041D\u0435\u043B\u0456\u043A\u0442\u0435\u043D \u0456\u0441\u043A\u0435 \u0430\u0441\u0430\u0434\u044B",
    trueLabel: "\u0414\u04B1\u0440\u044B\u0441",
    falseLabel: "\u0411\u04B1\u0440\u044B\u0441",
    match: "\u0421\u04D9\u0439\u043A\u0435\u0441\u0442\u0435\u043D\u0434\u0456\u0440\u0456\u04A3\u0456\u0437",
    term: "\u0422\u0435\u0440\u043C\u0438\u043D",
    definition: "\u0410\u043D\u044B\u049B\u0442\u0430\u043C\u0430",
    error: "\u049A\u0430\u0442\u0435",
    correction: "\u0422\u04AF\u0437\u0435\u0442\u0443",
    imageFailure: "\u0415\u0441\u043A\u0435\u0440\u0442\u0443: \u0416\u0418 \u0438\u043B\u043B\u044E\u0441\u0442\u0440\u0430\u0446\u0438\u044F\u043B\u0430\u0440\u044B \u0441\u04B1\u0440\u0430\u043B\u0434\u044B, \u0431\u0456\u0440\u0430\u049B \u043A\u0435\u0441\u043A\u0456\u043D\u0434\u0435\u0440 \u0441\u0435\u0440\u0432\u0438\u0441\u0456 \u0443\u0430\u049B\u044B\u0442\u0448\u0430 \u049B\u043E\u043B\u0436\u0435\u0442\u0456\u043C\u0441\u0456\u0437. \u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430\u043B\u0430\u0440 \u0441\u0443\u0440\u0435\u0442\u0441\u0456\u0437 \u0431\u0430\u0441\u044B\u043F \u0448\u044B\u0493\u0430\u0440\u044B\u043B\u0434\u044B.",
    cutNote: "\u0421\u044B\u0437\u044B\u049B \u0431\u043E\u0439\u044B\u043C\u0435\u043D \u049B\u0438\u044B\u043F, \u043E\u0440\u0442\u0430\u0441\u044B\u043D\u0430\u043D \u0431\u04AF\u043A\u0442\u0435\u04A3\u0456\u0437. \u0411\u0456\u0440 \u0431\u0435\u0442\u0456\u043D\u0434\u0435 \u0442\u0435\u0440\u043C\u0438\u043D, \u0435\u043A\u0456\u043D\u0448\u0456 \u0431\u0435\u0442\u0456\u043D\u0434\u0435 \u0430\u043D\u044B\u049B\u0442\u0430\u043C\u0430.",
    across: "\u041A\u04E9\u043B\u0434\u0435\u043D\u0435\u04A3\u0456\u043D\u0435\u043D",
    down: "\u0422\u0456\u0433\u0456\u043D\u0435\u043D",
    extraWords: "\u049A\u043E\u0441\u044B\u043C\u0448\u0430 \u0441\u04E9\u0437\u0434\u0435\u0440 (\u0442\u043E\u0440\u0493\u0430 \u043A\u0456\u0440\u043C\u0435\u0434\u0456)",
    answer: "\u0416\u0430\u0443\u0430\u043F",
    findWords: "\u0421\u04E9\u0437\u0434\u0435\u0440\u0434\u0456 \u0442\u0430\u043F",
    qr: "QR-\u043A\u043E\u0434",
    scan: "\u0441\u043A\u0430\u043D\u0435\u0440\u043B\u0435\u04A3\u0456\u0437",
    teacherAdds: "(\u043C\u04B1\u0493\u0430\u043B\u0456\u043C \u0435\u043D\u0433\u0456\u0437\u0435\u0434\u0456)",
    link: "\u0421\u0456\u043B\u0442\u0435\u043C\u0435",
    myResult: "\u041C\u0435\u043D\u0456\u04A3 \u043D\u04D9\u0442\u0438\u0436\u0435\u043C:",
    memo: "\u0416\u0410\u0414\u041D\u0410\u041C\u0410",
    example: "\u041C\u044B\u0441\u0430\u043B",
    selfCheck: "\u04E8\u0437\u0456\u04A3\u0434\u0456 \u0442\u0435\u043A\u0441\u0435\u0440"
  };
  return {
    task: "\u0417\u0430\u0434\u0430\u043D\u0438\u0435",
    points: "\u0431.",
    studentLine: "\u0424\u0418\u041E \u0443\u0447\u0435\u043D\u0438\u043A\u0430: ____ \u041A\u043B\u0430\u0441\u0441: ____ \u0414\u0430\u0442\u0430: ____",
    answers: "\u041E\u0442\u0432\u0435\u0442\u044B \u0434\u043B\u044F \u0443\u0447\u0438\u0442\u0435\u043B\u044F",
    descriptors: "\u0414\u0435\u0441\u043A\u0440\u0438\u043F\u0442\u043E\u0440\u044B \u0438 \u0431\u0430\u043B\u043B\u044B",
    criterion: "\u041A\u0440\u0438\u0442\u0435\u0440\u0438\u0439 \u043E\u0446\u0435\u043D\u0438\u0432\u0430\u043D\u0438\u044F",
    descriptor: "\u0414\u0435\u0441\u043A\u0440\u0438\u043F\u0442\u043E\u0440",
    total: "\u0418\u0442\u043E\u0433\u043E",
    wordBank: "\u0421\u043B\u043E\u0432\u0430 \u0434\u043B\u044F \u0440\u0430\u0441\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u044F",
    caseLabel: "\u041A\u0435\u0439\u0441",
    problem: "\u041F\u0440\u043E\u0431\u043B\u0435\u043C\u0430",
    solution: "\u0420\u0435\u0448\u0435\u043D\u0438\u0435",
    why: "\u041F\u043E\u0447\u0435\u043C\u0443 \u0441\u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442",
    trueLabel: "\u0412\u0435\u0440\u043D\u043E",
    falseLabel: "\u041D\u0435\u0432\u0435\u0440\u043D\u043E",
    match: "\u0421\u043E\u0435\u0434\u0438\u043D\u0438\u0442\u0435 \u043F\u0430\u0440\u044B",
    term: "\u0422\u0435\u0440\u043C\u0438\u043D",
    definition: "\u041E\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435",
    error: "\u041E\u0448\u0438\u0431\u043A\u0430",
    correction: "\u0418\u0441\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435",
    imageFailure: "\u041F\u0440\u0438\u043C\u0435\u0447\u0430\u043D\u0438\u0435: \u0418\u0418-\u0438\u043B\u043B\u044E\u0441\u0442\u0440\u0430\u0446\u0438\u0438 \u0437\u0430\u043F\u0440\u043E\u0448\u0435\u043D\u044B, \u043D\u043E \u0441\u0435\u0440\u0432\u0438\u0441 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0439 \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u2014 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0438 \u043D\u0430\u043F\u0435\u0447\u0430\u0442\u0430\u043D\u044B \u0431\u0435\u0437 \u0440\u0438\u0441\u0443\u043D\u043A\u043E\u0432.",
    cutNote: "\u0420\u0430\u0437\u0440\u0435\u0436\u044C\u0442\u0435 \u043F\u043E \u043B\u0438\u043D\u0438\u044F\u043C, \u0441\u043E\u0433\u043D\u0438\u0442\u0435 \u043F\u043E \u0441\u0435\u0440\u0435\u0434\u0438\u043D\u0435. \u0421 \u043E\u0434\u043D\u043E\u0439 \u0441\u0442\u043E\u0440\u043E\u043D\u044B \u2014 \u0442\u0435\u0440\u043C\u0438\u043D, \u0441 \u0434\u0440\u0443\u0433\u043E\u0439 \u2014 \u043E\u043F\u0440\u0435\u0434\u0435\u043B\u0435\u043D\u0438\u0435.",
    across: "\u041F\u043E \u0433\u043E\u0440\u0438\u0437\u043E\u043D\u0442\u0430\u043B\u0438",
    down: "\u041F\u043E \u0432\u0435\u0440\u0442\u0438\u043A\u0430\u043B\u0438",
    extraWords: "\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u0441\u043B\u043E\u0432\u0430 (\u043D\u0435 \u0432\u043E\u0448\u043B\u0438 \u0432 \u0441\u0435\u0442\u043A\u0443)",
    answer: "\u041E\u0442\u0432\u0435\u0442",
    findWords: "\u041D\u0430\u0439\u0434\u0438 \u0441\u043B\u043E\u0432\u0430",
    qr: "QR-\u043A\u043E\u0434",
    scan: "\u0441\u043A\u0430\u043D\u0438\u0440\u0443\u0439",
    teacherAdds: "(\u0432\u0441\u0442\u0430\u0432\u0438\u0442 \u0443\u0447\u0438\u0442\u0435\u043B\u044C)",
    link: "\u0421\u0441\u044B\u043B\u043A\u0430",
    myResult: "\u041C\u043E\u0439 \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442:",
    memo: "\u041F\u0410\u041C\u042F\u0422\u041A\u0410",
    example: "\u041F\u0440\u0438\u043C\u0435\u0440",
    selfCheck: "\u041F\u0440\u043E\u0432\u0435\u0440\u044C \u0441\u0435\u0431\u044F"
  };
}
async function buildHandoutDocx(h, options = {}) {
  return packChildren(handoutChildren(h, options.includeAnswers !== false), { ...options, language: h.language });
}
function handoutChildren(h, includeAnswers = true) {
  return h.kind === "worksheet" ? buildWorksheet(h, includeAnswers) : h.kind === "flashcards" ? buildFlashcards(h) : buildCrossword(h, includeAnswers);
}
async function packChildren(children, options) {
  const headers = [];
  const footers = [];
  if (options.showHeader !== false) {
    headers.push(buildHandoutHeader(options.schoolName, options.teacherName, options.language));
  }
  if (options.showFooter !== false) {
    footers.push(buildHandoutFooter(options.showPageNumbers !== false, options.language));
  }
  if (options.watermark) {
    footers.push(buildFreeWatermarkFooter());
  }
  const doc = new Document2({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 }
            // 1.27 cm
          }
        },
        ...headers.length > 0 ? { headers: { default: headers[0] } } : {},
        ...footers.length > 0 ? { footers: { default: footers[0] } } : {},
        children
      }
    ]
  });
  return await Packer2.toBuffer(doc);
}
function buildHandoutHeader(schoolName, teacherName, language) {
  const children = [];
  if (schoolName) {
    children.push(new Paragraph2({
      alignment: AlignmentType2.CENTER,
      children: [new TextRun2({ text: schoolName, bold: true, size: 20, color: NAVY })]
    }));
  }
  if (teacherName) {
    children.push(new Paragraph2({
      alignment: AlignmentType2.CENTER,
      children: [new TextRun2({ text: `${language === "kz" ? "\u041C\u04B1\u0493\u0430\u043B\u0456\u043C" : "\u0423\u0447\u0438\u0442\u0435\u043B\u044C"}: ${teacherName}`, size: 18, color: MUTED })]
    }));
  }
  return new Header({ children });
}
function buildHandoutFooter(showPageNumbers, language) {
  const children = [];
  if (showPageNumbers) {
    children.push(new Paragraph2({
      alignment: AlignmentType2.CENTER,
      children: [
        new TextRun2({ text: language === "kz" ? "\u0411\u0435\u0442 " : "\u0421\u0442\u0440\u0430\u043D\u0438\u0446\u0430 ", size: 16, color: MUTED }),
        new TextRun2({ children: [PageNumber.CURRENT], size: 16, color: MUTED }),
        new TextRun2({ text: language === "kz" ? " / " : " \u0438\u0437 ", size: 16, color: MUTED }),
        new TextRun2({ children: [PageNumber.TOTAL_PAGES], size: 16, color: MUTED })
      ]
    }));
  }
  return new Footer2({ children });
}
function buildWorksheet(w, includeAnswers = true) {
  const out = [];
  const copy = worksheetCopy(w.language);
  out.push(new Paragraph2({
    alignment: AlignmentType2.LEFT,
    spacing: { after: 200 },
    children: [
      new TextRun2({ text: w.metaLine?.trim() ? w.metaLine : copy.studentLine, bold: true, size: 24 })
    ]
  }));
  out.push(titleLine(w.title));
  if (w.intro?.trim()) {
    out.push(new Paragraph2({
      alignment: AlignmentType2.CENTER,
      spacing: { after: 160 },
      children: [new TextRun2({ text: w.intro, italics: true, size: 20, color: MUTED })]
    }));
  }
  if (w.imagesFailed) out.push(imageFailureNote(copy));
  out.push(spacer());
  const closingPrompts = w.tasks.filter((task) => task.type === "creative").map((task) => task.prompt).filter((prompt) => prompt.trim().length > 0);
  w.tasks.forEach((task, index) => {
    if (task.type === "creative") return;
    out.push(...taskBlock(task, index + 1, includeAnswers, copy, w.language));
    out.push(spacer());
  });
  closingPrompts.forEach((prompt) => {
    out.push(closingTaskLine(prompt));
    out.push(spacer());
  });
  if (includeAnswers) {
    const answers = worksheetAnswerLines(w.tasks, w.language ?? "ru");
    if (answers.length > 0) {
      out.push(new Paragraph2({ pageBreakBefore: true }));
      out.push(p(copy.answers, { bold: true, color: NAVY, size: 24 }));
      out.push(...teacherAnswersBlock(answers, copy));
      out.push(spacer());
    }
    out.push(p(copy.descriptors, { bold: true, color: NAVY }));
    out.push(descriptorTable(w, copy));
  }
  return out;
}
function titleLine(text) {
  return new Paragraph2({
    heading: HeadingLevel2.HEADING_1,
    alignment: AlignmentType2.CENTER,
    spacing: { after: 120 },
    children: [new TextRun2({ text, bold: true, color: NAVY, size: 32 })]
  });
}
function imageFailureNote(copy) {
  return new Paragraph2({
    spacing: { before: 80 },
    children: [
      new TextRun2({
        text: copy.imageFailure,
        italics: true,
        color: "9B651F",
        size: 18
      })
    ]
  });
}
var CARD_BORDER = { style: BorderStyle2.SINGLE, size: 6, color: "B9C6E4" };
var CARD_BORDERS = { top: CARD_BORDER, bottom: CARD_BORDER, left: CARD_BORDER, right: CARD_BORDER };
var CARD_MARGINS = { top: 160, bottom: 160, left: 200, right: 200 };
function taskBlock(t, index, includeAnswers, copy, language) {
  const inner = [taskBanner(index, t, copy, language)];
  const bodyItems = taskBody(t, index, copy);
  if (t.imageBase64) {
    const img = imageParagraph(t, 240, 180);
    if (img) {
      inner.push(
        new Table2({
          width: FULL_WIDTH,
          borders: NO_BORDERS,
          rows: [
            new TableRow2({
              children: [
                new TableCell2({
                  width: { size: 70, type: WidthType2.PERCENTAGE },
                  children: bodyItems
                }),
                new TableCell2({
                  width: { size: 30, type: WidthType2.PERCENTAGE },
                  children: [img]
                })
              ]
            })
          ]
        })
      );
    } else {
      inner.push(...bodyItems);
    }
  } else {
    inner.push(...bodyItems);
  }
  if (includeAnswers) inner.push(...descriptorLines(t, copy));
  return [
    new Table2({
      width: FULL_WIDTH,
      rows: [
        new TableRow2({
          children: [
            new TableCell2({
              borders: CARD_BORDERS,
              margins: CARD_MARGINS,
              children: inner
            })
          ]
        })
      ]
    })
  ];
}
function taskBanner(index, t, copy, language) {
  return new Paragraph2({
    shading: { type: ShadingType.CLEAR, fill: LIGHT_BLUE },
    spacing: { before: 120, after: 100 },
    children: [
      new TextRun2({ text: `${copy.task} ${index}. ${worksheetTypeLabel(t.type, language ?? "ru")} (${t.points} ${copy.points})`, bold: true, color: NAVY, size: 22 })
    ]
  });
}
function imageParagraph(t, width, height) {
  const base64 = t.imageBase64;
  if (!base64) return null;
  try {
    return new Paragraph2({
      alignment: AlignmentType2.CENTER,
      spacing: { after: 120 },
      children: [
        new ImageRun({
          data: Buffer.from(base64, "base64"),
          transformation: { width, height },
          type: t.imageMime === "image/png" ? "png" : "jpg",
          altText: t.imageAlt ? { title: t.imageAlt, description: t.imageAlt, name: t.imageAlt } : void 0
        })
      ]
    });
  } catch {
    return null;
  }
}
function taskBody(t, index, copy) {
  switch (t.type) {
    case "open":
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
        ...numberedWriteLines(2)
      ];
    case "case_study":
      return [...promptParagraphs(t.prompt, index, t), caseCloud(t.situation ?? "", copy), writeLine(`${copy.problem}:`), writeLine(`${copy.solution}:`), writeLine(`${copy.why}:`)];
    case "multiple_choice":
      return [
        ...promptParagraphs(t.prompt, index, t),
        ...(t.options ?? []).map(
          (option, i) => new Paragraph2({
            spacing: { after: 40 },
            children: [new TextRun2({ text: `\u2610 ${optionLetter(i)}) ${option}` })]
          })
        )
      ];
    case "true_false":
      return [...promptParagraphs(t.prompt, index, t), p(`\u2610 ${copy.trueLabel}        \u2610 ${copy.falseLabel}`)];
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
        new Table2({
          width: FULL_WIDTH,
          rows: [
            new TableRow2({
              children: [
                new TableCell2({
                  borders: THIN_BORDERS,
                  margins: CELL_MARGINS,
                  width: { size: 28, type: WidthType2.PERCENTAGE },
                  children: [
                    new Paragraph2({
                      alignment: AlignmentType2.CENTER,
                      children: [new TextRun2({ text: copy.qr, bold: true, size: 20, color: NAVY })]
                    }),
                    new Paragraph2({
                      alignment: AlignmentType2.CENTER,
                      children: [new TextRun2({ text: t.link ? copy.scan : copy.teacherAdds, size: 16, color: MUTED })]
                    })
                  ]
                }),
                new TableCell2({
                  borders: THIN_BORDERS,
                  margins: CELL_MARGINS,
                  width: { size: 72, type: WidthType2.PERCENTAGE },
                  children: [
                    new Paragraph2({
                      children: [new TextRun2({ text: t.link ? `${copy.link}: ${t.link}` : `${copy.link}: ___________________________ ${copy.teacherAdds}`, bold: Boolean(t.link), size: 18, color: NAVY })]
                    }),
                    new Paragraph2({
                      spacing: { before: 120 },
                      border: { bottom: { style: BorderStyle2.DASHED, size: 6, color: "808080", space: 2 } },
                      children: [new TextRun2({ text: copy.myResult, size: 20, color: MUTED })]
                    })
                  ]
                })
              ]
            })
          ]
        })
      ];
    case "creative":
      return [...promptParagraphs(t.prompt, index, t), writeLine(), writeLine(), writeLine()];
    case "word_search":
      return [...promptParagraphs(t.prompt, index, t), wordSearchGrid(t.searchWords ?? []), writeLine(`${copy.findWords}:`)];
    case "ordering":
      return [...promptParagraphs(t.prompt, index, t), orderingList(t.orderItems ?? []), writeLine(), writeLine()];
    case "odd_one_out":
      return [...promptParagraphs(t.prompt, index, t), oddOneOutItems(t.oddItems ?? []), writeLine(copy.error === "\u049A\u0430\u0442\u0435" ? "\u049A\u0430\u0439 \u044D\u043B\u0435\u043C\u0435\u043D\u0442 \u0430\u0440\u0442\u044B\u049B? \u041D\u0435\u043B\u0456\u043A\u0442\u0435\u043D?" : "\u041A\u0430\u043A\u043E\u0439 \u044D\u043B\u0435\u043C\u0435\u043D\u0442 \u043B\u0438\u0448\u043D\u0438\u0439? \u041F\u043E\u0447\u0435\u043C\u0443?")];
    case "categorize":
      return [...promptParagraphs(t.prompt, index, t), categorizeTable(t.categories ?? [], t.categoryItems ?? []), writeLine(), writeLine()];
  }
}
function promptParagraphs(text, index, t) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  void index;
  void t;
  return lines.map((line, i) => {
    const children = [];
    if (i === 0) {
      children.push(new TextRun2({ text: line, bold: true, size: 24 }));
    } else {
      children.push(new TextRun2({ text: line, size: 22 }));
    }
    return new Paragraph2({
      spacing: { after: 80 },
      children
    });
  });
}
function writeLine(label = "") {
  return new Paragraph2({
    spacing: { after: 140 },
    border: { bottom: { style: BorderStyle2.DASHED, size: 6, color: "808080", space: 2 } },
    children: [new TextRun2({ text: label ? `${label} ` : " ", size: 20, color: MUTED })]
  });
}
function wordBankBox(words, copy) {
  const items = words.length > 0 ? words : ["\u2014"];
  return new Table2({
    width: FULL_WIDTH,
    rows: [
      new TableRow2({
        children: [
          new TableCell2({
            borders: THIN_BORDERS,
            shading: { type: ShadingType.CLEAR, fill: WORD_BANK_GOLD },
            margins: CELL_MARGINS,
            children: [
              new Paragraph2({
                children: [
                  new TextRun2({ text: `${copy.wordBank}: `, bold: true, size: 20, color: NAVY }),
                  new TextRun2({ text: items.join("  \xB7  "), size: 20 })
                ]
              })
            ]
          })
        ]
      })
    ]
  });
}
function sortItemsBox(items, copy) {
  const list = items.length > 0 ? items.join("  -  ") : "\u2014";
  return new Table2({
    width: FULL_WIDTH,
    rows: [
      new TableRow2({
        children: [
          new TableCell2({
            borders: THIN_BORDERS,
            shading: { type: ShadingType.CLEAR, fill: WORD_BANK_GOLD },
            margins: CELL_MARGINS,
            children: [
              new Paragraph2({
                children: [
                  new TextRun2({ text: `${copy.wordBank}: `, bold: true, size: 20, color: NAVY }),
                  new TextRun2({ text: list, size: 20, color: "1F4E9C" })
                ]
              })
            ]
          })
        ]
      })
    ]
  });
}
function sortTable(groups, items, copy) {
  const headers = groups && groups[0] && groups[1] ? groups : copy.task === "\u0422\u0430\u043F\u0441\u044B\u0440\u043C\u0430" ? ["1-\u0442\u043E\u043F", "2-\u0442\u043E\u043F"] : ["\u0413\u0440\u0443\u043F\u043F\u0430 1", "\u0413\u0440\u0443\u043F\u043F\u0430 2"];
  const rows = Math.max(3, Math.min(8, Math.ceil(items.length / 4)));
  return new Table2({
    width: FULL_WIDTH,
    rows: [
      new TableRow2({ children: [headCell(headers[0], HEADER_BLUE, "FFFFFF"), headCell(headers[1], HEADER_BLUE, "FFFFFF")] }),
      ...Array.from(
        { length: rows },
        () => new TableRow2({ height: { value: 1200, rule: "atLeast" }, children: [cell(""), cell("")] })
      )
    ]
  });
}
function numberedWriteLines(count, indent = 0) {
  return Array.from({ length: Math.max(1, count) }, (_, i) => {
    const children = [new TextRun2({ text: `${i + 1} `, size: 22 })];
    if (indent > 0) {
      children[0] = new TextRun2({ text: " ".repeat(indent) + `${i + 1} `, size: 22 });
    }
    return new Paragraph2({
      spacing: { after: 160 },
      tabStops: [{ type: TabStopType.LEFT, position: 600 + indent * 60 }],
      border: { bottom: { style: BorderStyle2.SINGLE, size: 4, color: "A6A6A6", space: 4 } },
      children: [...children, new TextRun2({ text: "	", size: 22 })]
    });
  });
}
function closingTaskLine(text) {
  return new Paragraph2({
    spacing: { before: 120, after: 120 },
    border: { bottom: { style: BorderStyle2.SINGLE, size: 6, color: "9CC3E5", space: 4 } },
    children: [new TextRun2({ text: `${text} `, italics: true, size: 22, color: "1F4E9C" })]
  });
}
function checklistParagraphs(options) {
  const items = options.length > 0 ? options : ["\u2014"];
  return items.map(
    (option) => new Paragraph2({
      spacing: { after: 40 },
      children: [new TextRun2({ text: `\u2610 ${option}`, size: 22 })]
    })
  );
}
function caseCloud(situation, copy) {
  const lines = situation.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  const cloud = lines.length > 0 ? lines.map((line) => new Paragraph2({ children: [new TextRun2({ text: line, italics: true, size: 20, color: "7A3E12" })] })) : [new Paragraph2({ children: [new TextRun2({ text: "\u2014", italics: true, size: 20, color: "7A3E12" })] })];
  return new Table2({
    width: FULL_WIDTH,
    rows: [
      new TableRow2({
        children: [
          new TableCell2({
            borders: NO_BORDERS,
            shading: { type: ShadingType.CLEAR, fill: CLOUD_PEACH },
            margins: { top: 220, bottom: 220, left: 220, right: 220 },
            children: [
              new Paragraph2({ children: [new TextRun2({ text: `${copy.caseLabel}:`, bold: true, size: 20, color: "7A3E12" })] }),
              ...cloud
            ]
          })
        ]
      })
    ]
  });
}
function tableFixBodyInner(t, copy) {
  const headers = t.tableHeaders && t.tableHeaders.length === 2 ? t.tableHeaders : [copy.error, copy.correction];
  const rows = resolveTableRows(t.tableRows);
  return fixTable(headers, rows);
}
function scenarioTable(t, copy) {
  const count = resolveErrorsCount(t.errorsCount);
  const left = [];
  for (let n = 1; n <= count; n++) {
    left.push(new Paragraph2({ spacing: { before: 40 }, children: [new TextRun2({ text: `${copy.error} ${n}:`, bold: true, size: 20, color: NAVY })] }));
    left.push(writeLine());
    left.push(new Paragraph2({ children: [new TextRun2({ text: `${copy.correction}:`, bold: true, size: 20, color: NAVY })] }));
    left.push(writeLine());
  }
  const cloudLines = (t.situation ?? "").split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  const cloud = cloudLines.length > 0 ? cloudLines.map((line) => new Paragraph2({ children: [new TextRun2({ text: line, italics: true, size: 20, color: "7A3E12" })] })) : [new Paragraph2({ children: [new TextRun2({ text: "\u2014", italics: true, size: 20, color: "7A3E12" })] })];
  return new Table2({
    width: FULL_WIDTH,
    rows: [
      new TableRow2({
        children: [
          new TableCell2({ borders: NO_BORDERS, width: { size: 54, type: WidthType2.PERCENTAGE }, margins: CELL_MARGINS, children: left }),
          new TableCell2({
            borders: NO_BORDERS,
            width: { size: 46, type: WidthType2.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: CLOUD_PEACH },
            margins: { top: 220, bottom: 220, left: 220, right: 220 },
            children: cloud
          })
        ]
      })
    ]
  });
}
function choiceButtons(choices) {
  const items = choices.length > 0 ? choices : ["\u21161", "\u21162", "\u21163"];
  const width = Math.floor(100 / items.length);
  return new Table2({
    width: FULL_WIDTH,
    rows: [
      new TableRow2({
        children: items.map(
          (choice) => new TableCell2({
            borders: NAVY_BORDERS,
            shading: { type: ShadingType.CLEAR, fill: BTN_BLUE },
            margins: CELL_MARGINS,
            width: { size: width, type: WidthType2.PERCENTAGE },
            children: [
              new Paragraph2({
                alignment: AlignmentType2.CENTER,
                children: [new TextRun2({ text: `\u2610 ${choice}`, bold: true, color: "FFFFFF", size: 22 })]
              })
            ]
          })
        )
      })
    ]
  });
}
function reflectionTable(options, copy) {
  const labels = options.length === 3 ? options : copy.task === "\u0422\u0430\u043F\u0441\u044B\u0440\u043C\u0430" ? ["\u0411\u0430\u0440\u043B\u044B\u0493\u044B\u043D \u0442\u04AF\u0441\u0456\u043D\u0434\u0456\u043C", "\u0421\u04B1\u0440\u0430\u0493\u044B\u043C \u0431\u0430\u0440", "\u041A\u04E9\u043C\u0435\u043A \u043A\u0435\u0440\u0435\u043A"] : ["\u0412\u0441\u0451 \u043F\u043E\u043D\u044F\u043B(\u0430)", "\u0415\u0441\u0442\u044C \u0441\u043E\u043C\u043D\u0435\u043D\u0438\u044F", "\u041D\u0443\u0436\u043D\u0430 \u043F\u043E\u043C\u043E\u0449\u044C"];
  const fills = [REFLECT_GREEN, REFLECT_BLUE, REFLECT_RED];
  return new Table2({
    width: FULL_WIDTH,
    rows: [
      new TableRow2({
        height: { value: 560, rule: "atLeast" },
        children: labels.map(
          (label, i) => new TableCell2({
            borders: THIN_BORDERS,
            shading: { type: ShadingType.CLEAR, fill: fills[i] ?? REFLECT_GREEN },
            margins: CELL_MARGINS,
            width: { size: Math.floor(100 / labels.length), type: WidthType2.PERCENTAGE },
            children: [
              new Paragraph2({
                alignment: AlignmentType2.CENTER,
                children: [new TextRun2({ text: `\u2610 ${label}`, size: 20 })]
              })
            ]
          })
        )
      })
    ]
  });
}
function fixTable(headers, rowCount) {
  return new Table2({
    width: FULL_WIDTH,
    rows: [
      new TableRow2({ children: [headCell(headers[0], HEADER_GREY), headCell(headers[1], HEADER_GREY)] }),
      ...Array.from(
        { length: rowCount },
        () => new TableRow2({ height: { value: 620, rule: "atLeast" }, children: [cell(""), cell("")] })
      )
    ]
  });
}
function headCell(text, fill, color = NAVY) {
  return new TableCell2({
    borders: NAVY_BORDERS,
    shading: { type: ShadingType.CLEAR, fill },
    margins: CELL_MARGINS,
    children: [
      new Paragraph2({ alignment: AlignmentType2.CENTER, children: [new TextRun2({ text, bold: true, color })] })
    ]
  });
}
function matchTable(left, right, copy) {
  const max = Math.max(left.length, right.length);
  const rows = [
    new TableRow2({ children: [headCell(copy.term, HEADER_BLUE, "FFFFFF"), headCell(copy.definition, HEADER_BLUE, "FFFFFF")] })
  ];
  for (let i = 0; i < max; i++) {
    rows.push(new TableRow2({ height: { value: 480, rule: "atLeast" }, children: [cell(left[i] ?? ""), cell(right[i] ?? "")] }));
  }
  return new Table2({ rows, width: FULL_WIDTH });
}
function teacherAnswersBlock(lines, copy) {
  return [
    p(copy.answers, { bold: true, color: NAVY }),
    new Table2({
      width: FULL_WIDTH,
      rows: [
        new TableRow2({
          children: [
            new TableCell2({
              borders: THIN_BORDERS,
              shading: { type: ShadingType.CLEAR, fill: GRADING_GREY },
              margins: CELL_MARGINS,
              children: lines.map(
                (line) => new Paragraph2({ spacing: { after: 40 }, children: [new TextRun2({ text: line, size: 18 })] })
              )
            })
          ]
        })
      ]
    })
  ];
}
function descriptorLines(t, copy) {
  return [
    new Paragraph2({
      spacing: { before: 60 },
      children: [new TextRun2({ text: `${copy.criterion}: ${t.criterion}`, size: 16, italics: true, color: MUTED })]
    }),
    new Paragraph2({
      children: [new TextRun2({ text: `${copy.descriptor}: ${t.descriptor}`, size: 16, italics: true, color: MUTED })]
    })
  ];
}
function descriptorTable(w, copy) {
  const rows = [
    new TableRow2({ children: [headCell(copy.task, HEADER_BLUE, "FFFFFF"), headCell(copy.criterion, HEADER_BLUE, "FFFFFF"), headCell(copy.descriptor, HEADER_BLUE, "FFFFFF"), headCell(copy.points, HEADER_BLUE, "FFFFFF")] }),
    ...w.tasks.map(
      (task, index) => new TableRow2({ children: [cell(`${copy.task} ${index + 1}`), cell(task.criterion), cell(task.descriptor), cell(String(task.points))] })
    ),
    new TableRow2({
      children: [
        cell(copy.total, { bold: true }),
        cell(""),
        cell(""),
        cell(String(w.tasks.reduce((sum, task) => sum + task.points, 0)), { bold: true })
      ]
    })
  ];
  return new Table2({ rows, width: FULL_WIDTH });
}
function cell(text, opts) {
  return new TableCell2({
    borders: NAVY_BORDERS,
    margins: CELL_MARGINS,
    children: [new Paragraph2({ children: [new TextRun2({ text, bold: opts?.bold })] })]
  });
}
function buildFlashcards(f) {
  const out = [];
  const copy = worksheetCopy(f.language);
  out.push(heading(f.title));
  if (f.intro) out.push(p(f.intro));
  if (f.imagesFailed) out.push(imageFailureNote(copy));
  out.push(spacer());
  const rows = [];
  for (let i = 0; i < f.cards.length; i += 2) {
    const left = f.cards[i];
    const right = f.cards[i + 1];
    rows.push(
      new TableRow2({
        children: [flashCell(left, copy, i), flashCell(right, copy, i + 1)],
        height: { value: 2400, rule: "atLeast" }
      })
    );
  }
  out.push(new Table2({ rows, width: FULL_WIDTH }));
  out.push(spacer());
  out.push(p(copy.cutNote, { italics: true }));
  return out;
}
function flashCell(card, copy, index) {
  if (!card) return cell("");
  const children = [];
  const base64 = card.imageBase64;
  if (base64) {
    try {
      const data = Buffer.from(base64, "base64");
      children.push(
        new Paragraph2({
          alignment: AlignmentType2.CENTER,
          children: [
            new ImageRun({
              data,
              transformation: { width: 112, height: 112 },
              type: card.imageMime === "image/png" ? "png" : "jpg",
              altText: card.imageAlt ? { title: card.imageAlt, description: card.imageAlt, name: card.imageAlt } : void 0
            })
          ]
        })
      );
    } catch {
    }
  }
  children.push(
    new Paragraph2({
      alignment: AlignmentType2.CENTER,
      spacing: { after: 60 },
      children: [new TextRun2({ text: `${copy.memo} ${String(index + 1).padStart(2, "0")}`, bold: true, size: 16, color: NAVY })]
    }),
    new Paragraph2({
      alignment: AlignmentType2.CENTER,
      spacing: { after: 80 },
      children: [new TextRun2({ text: card.front, bold: true, size: 28, color: NAVY })]
    }),
    new Paragraph2({
      spacing: { after: 100 },
      children: [new TextRun2({ text: card.back, size: 18 })]
    })
  );
  if (card.example) {
    children.push(new Paragraph2({
      spacing: { before: 40, after: 70 },
      children: [
        new TextRun2({ text: `${copy.example}: `, bold: true, size: 16, color: NAVY }),
        new TextRun2({ text: card.example, size: 16 })
      ]
    }));
  }
  if (card.checkQuestion) {
    children.push(new Paragraph2({
      border: { top: { style: BorderStyle2.DASHED, size: 4, color: "A6A6A6", space: 3 } },
      children: [
        new TextRun2({ text: `\u2726 ${copy.selfCheck}: `, bold: true, size: 16, color: NAVY }),
        new TextRun2({ text: card.checkQuestion, size: 16 })
      ]
    }));
  }
  return new TableCell2({
    borders: THIN_BORDERS,
    width: { size: 50, type: WidthType2.PERCENTAGE },
    margins: CELL_MARGINS,
    children
  });
}
function buildCrossword(c, includeAnswers = true) {
  const out = [];
  const copy = worksheetCopy(c.language);
  out.push(heading(c.title));
  if (c.intro) out.push(p(c.intro));
  out.push(spacer());
  if (c.grid.length > 0) {
    const numAt = /* @__PURE__ */ new Map();
    for (const n of c.numbers) numAt.set(`${n.row},${n.col}`, n.number);
    const rows = [];
    for (let r = 0; r < c.grid.length; r++) {
      const cells = [];
      for (let cIdx = 0; cIdx < c.grid[0].length; cIdx++) {
        const ch = c.grid[r][cIdx];
        const num = numAt.get(`${r},${cIdx}`);
        if (ch === null) {
          cells.push(
            new TableCell2({
              width: { size: 600, type: WidthType2.DXA },
              // ~1.05cm
              borders: NO_BORDERS,
              shading: { fill: "FFFFFF" },
              children: [new Paragraph2("")]
            })
          );
        } else {
          cells.push(
            new TableCell2({
              borders: THIN_BORDERS,
              width: { size: 600, type: WidthType2.DXA },
              children: [
                new Paragraph2({
                  alignment: AlignmentType2.LEFT,
                  children: num ? [new TextRun2({ text: String(num), size: 14, superScript: true })] : [new TextRun2({ text: " " })]
                })
              ]
            })
          );
        }
      }
      rows.push(new TableRow2({ children: cells, height: { value: 600, rule: "atLeast" } }));
    }
    out.push(new Table2({ rows }));
    out.push(spacer());
  }
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
    for (const w of c.unplaced) out.push(p(`\u2022 ${w.clue} \u2014 (${w.word.length} \u0431\u0443\u043A\u0432)`));
  }
  if (includeAnswers && c.placed.length) {
    out.push(new Paragraph2({ pageBreakBefore: true }));
    out.push(p(copy.answers, { bold: true, color: NAVY, size: 24 }));
    for (const w of c.placed) out.push(p(`${w.number}. ${w.word} \u2014 ${w.clue}`));
  }
  return out;
}
function wordSearchGrid(words) {
  const size = Math.max(8, Math.ceil(Math.sqrt(words.join("").length)) + 2);
  const grid = Array.from({ length: size }, () => Array(size).fill(""));
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
  const letters = "\u0410\u0411\u0412\u0413\u0414\u0415\u0401\u0416\u0417\u0418\u0419\u041A\u041B\u041C\u041D\u041E\u041F\u0420\u0421\u0422\u0423\u0424\u0425\u0426\u0427\u0428\u0429\u042A\u042B\u042C\u042D\u042E\u042F";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!grid[r][c]) {
        grid[r][c] = letters[Math.floor(Math.random() * letters.length)];
      }
    }
  }
  const rows = grid.map(
    (row) => new TableRow2({
      children: row.map(
        (letter) => new TableCell2({
          borders: THIN_BORDERS,
          width: { size: Math.floor(100 / size), type: WidthType2.PERCENTAGE },
          children: [
            new Paragraph2({
              alignment: AlignmentType2.CENTER,
              children: [new TextRun2({ text: letter, size: 20 })]
            })
          ]
        })
      )
    })
  );
  return new Table2({ rows, width: FULL_WIDTH });
}
function orderingList(items) {
  const rows = items.map(
    (item, i) => new TableRow2({
      children: [
        new TableCell2({
          borders: THIN_BORDERS,
          width: { size: 10, type: WidthType2.PERCENTAGE },
          children: [new Paragraph2({ alignment: AlignmentType2.CENTER, children: [new TextRun2({ text: `${i + 1}.`, bold: true, size: 20, color: NAVY })] })]
        }),
        new TableCell2({
          borders: THIN_BORDERS,
          width: { size: 90, type: WidthType2.PERCENTAGE },
          children: [new Paragraph2({ children: [new TextRun2({ text: item, size: 20 })] })]
        })
      ]
    })
  );
  return new Table2({ rows, width: FULL_WIDTH });
}
function oddOneOutItems(items) {
  const rows = items.map(
    (item, i) => new TableRow2({
      children: [
        new TableCell2({
          borders: THIN_BORDERS,
          width: { size: 10, type: WidthType2.PERCENTAGE },
          children: [new Paragraph2({ alignment: AlignmentType2.CENTER, children: [new TextRun2({ text: optionLetter(i), bold: true, size: 20, color: NAVY })] })]
        }),
        new TableCell2({
          borders: THIN_BORDERS,
          width: { size: 90, type: WidthType2.PERCENTAGE },
          children: [new Paragraph2({ children: [new TextRun2({ text: item, size: 20 })] })]
        })
      ]
    })
  );
  return new Table2({ rows, width: FULL_WIDTH });
}
function categorizeTable(categories, items) {
  const headers = categories.length > 0 ? categories : ["\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F 1", "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F 2"];
  const rows = [
    new TableRow2({
      children: headers.map((h) => headCell(h, HEADER_BLUE, "FFFFFF"))
    })
  ];
  const itemsPerCategory = Math.ceil(items.length / headers.length);
  for (let i = 0; i < itemsPerCategory; i++) {
    rows.push(
      new TableRow2({
        children: headers.map((_, ci) => {
          const item = items[i * headers.length + ci] ?? "";
          return cell(item);
        })
      })
    );
  }
  return new Table2({ rows, width: FULL_WIDTH });
}
function p(text, opts) {
  return new Paragraph2({
    children: [new TextRun2({ text, bold: opts?.bold, italics: opts?.italics, color: opts?.color, size: opts?.size })]
  });
}
function heading(text) {
  return new Paragraph2({
    heading: HeadingLevel2.HEADING_1,
    alignment: AlignmentType2.CENTER,
    children: [new TextRun2({ text, bold: true })]
  });
}
function spacer() {
  return new Paragraph2({ children: [new TextRun2({ text: "" })] });
}

// .card-qa/generate.ts
var cards = [
  {
    front: "\u0413\u0440\u0430\u0444\u0438\u0447\u0435\u0441\u043A\u0430\u044F \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F",
    back: "\u0418\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F, \u043A\u043E\u0442\u043E\u0440\u0443\u044E \u043C\u044B \u0432\u043E\u0441\u043F\u0440\u0438\u043D\u0438\u043C\u0430\u0435\u043C \u0441 \u043F\u043E\u043C\u043E\u0449\u044C\u044E \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0439, \u0441\u0445\u0435\u043C, \u043A\u0430\u0440\u0442 \u0438 \u0444\u043E\u0442\u043E\u0433\u0440\u0430\u0444\u0438\u0439.",
    example: "\u0424\u043E\u0442\u043E\u0433\u0440\u0430\u0444\u0438\u044F \u0433\u043E\u0440\u043D\u043E\u0433\u043E \u043E\u0437\u0435\u0440\u0430 \u0438 \u043A\u0430\u0440\u0442\u0430 \u043C\u0430\u0440\u0448\u0440\u0443\u0442\u0430 \u043E\u0442\u043D\u043E\u0441\u044F\u0442\u0441\u044F \u043A \u0433\u0440\u0430\u0444\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u0438.",
    checkQuestion: "\u041A\u0430\u043A\u043E\u0439 \u0432\u0438\u0434 \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u0438 \u043F\u0440\u0435\u0434\u0441\u0442\u0430\u0432\u043B\u044F\u0435\u0442 \u0434\u0438\u0430\u0433\u0440\u0430\u043C\u043C\u0430?"
  },
  {
    front: "\u0417\u0432\u0443\u043A\u043E\u0432\u0430\u044F \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F",
    back: "\u0418\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F, \u043F\u0435\u0440\u0435\u0434\u0430\u043D\u043D\u0430\u044F \u0441 \u043F\u043E\u043C\u043E\u0449\u044C\u044E \u0437\u0432\u0443\u043A\u043E\u0432: \u0440\u0435\u0447\u0438, \u043C\u0443\u0437\u044B\u043A\u0438, \u0441\u0438\u0433\u043D\u0430\u043B\u043E\u0432 \u0438 \u0448\u0443\u043C\u043E\u0432.",
    example: "\u0424\u0430\u0439\u043B song.mp3 \u0445\u0440\u0430\u043D\u0438\u0442 \u0437\u0432\u0443\u043A\u043E\u0432\u0443\u044E \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044E.",
    checkQuestion: "\u041A\u0430\u043A\u043E\u0435 \u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043D\u0438\u0435 \u0447\u0430\u0441\u0442\u043E \u0432\u0441\u0442\u0440\u0435\u0447\u0430\u0435\u0442\u0441\u044F \u0443 \u0430\u0443\u0434\u0438\u043E\u0444\u0430\u0439\u043B\u0430?"
  },
  {
    front: "\u0422\u0435\u043A\u0441\u0442\u043E\u0432\u0430\u044F \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F",
    back: "\u0418\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F, \u0437\u0430\u043F\u0438\u0441\u0430\u043D\u043D\u0430\u044F \u0431\u0443\u043A\u0432\u0430\u043C\u0438, \u0441\u043B\u043E\u0432\u0430\u043C\u0438, \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u044F\u043C\u0438 \u0438 \u0447\u0438\u0441\u043B\u0430\u043C\u0438.",
    example: "\u0420\u0430\u0441\u0441\u043A\u0430\u0437 story.txt \u0438 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0432 \u0447\u0430\u0442\u0435 \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442 \u0442\u0435\u043A\u0441\u0442\u043E\u0432\u0443\u044E \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044E.",
    checkQuestion: "\u041C\u043E\u0436\u043D\u043E \u043B\u0438 \u043D\u0430\u0437\u0432\u0430\u0442\u044C \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0443\u0440\u043E\u043A\u043E\u0432 \u0442\u0435\u043A\u0441\u0442\u043E\u0432\u043E\u0439 \u0438\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u0435\u0439? \u041F\u043E\u0447\u0435\u043C\u0443?"
  }
];
var buffer = await buildHandoutDocx({
  kind: "flashcards",
  language: "ru",
  title: "\u041F\u0430\u043C\u044F\u0442\u043A\u0438 \u0418\u043D\u0444\u043E\u0440\u043C\u0430\u0446\u0438\u044F \u0432\u043E\u043A\u0440\u0443\u0433 \u043D\u0430\u0441",
  intro: "\u0420\u0430\u0441\u0441\u043C\u043E\u0442\u0440\u0438 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443, \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0439 \u043F\u0440\u0438\u043C\u0435\u0440 \u0438 \u043E\u0442\u0432\u0435\u0442\u044C \u043D\u0430 \u0432\u043E\u043F\u0440\u043E\u0441 \u0434\u043B\u044F \u0441\u0430\u043C\u043E\u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0438.",
  cards
});
writeFileSync(".card-qa/flashcards.docx", buffer);
