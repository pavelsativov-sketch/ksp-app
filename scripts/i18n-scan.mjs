// Сканер непереведённых строк: ищет кириллицу в строковых литералах и JSX-тексте,
// исключая словари и комментарии. Показывает прогресс i18n по файлам.
import fs from "node:fs";
import path from "node:path";

// Слова, которые встречаются и в словарях — их пропускаем при подсчёте файлов словарей.
const isDict = (f) => /dictionaries\.ts$/.test(f);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  // Аргументом может быть и отдельный файл — покажем его строки тоже.
  if (fs.statSync(dir).isFile()) return /\.tsx?$/.test(dir) ? [dir] : out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Убираем комментарии, чтобы не считать их пользовательским текстом. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["src/components", "src/app"];

const files = targets.flatMap((t) => walk(t));
const rows = [];
let total = 0;

for (const f of files) {
  if (isDict(f)) continue;
  const raw = stripComments(fs.readFileSync(f, "utf8"));
  const hits = new Set();

  // JSX-текст: >текст<
  for (const m of raw.matchAll(/>([^<>{}]*[А-Яа-яЁёҚқҢңҒғӘәҰұҮүҺһІі][^<>{}]*)</g)) {
    const v = m[1].trim();
    if (v.length > 1) hits.add(v);
  }
  // Строковые литералы с кириллицей (кроме import-путей и URL).
  // Строки в value="..." — это значения полей (например, метод оценивания),
  // они хранятся в данных плана и не переводятся.
  for (const m of raw.matchAll(/(["'`])([^"'`\n]*[А-Яа-яЁёҚқҢңҒғӘәҰұҮүҺһІі][^"'`\n]*)\1/g)) {
    const v = m[2].trim();
    const before = raw.slice(Math.max(0, m.index - 12), m.index);
    if (/value[=:]\s*$/.test(before)) continue;
    if (v.length > 1 && !/^(@\/|\/|\.\/|https?:)/.test(v)) hits.add(v);
  }

  if (hits.size) {
    rows.push([hits.size, f, [...hits]]);
    total += hits.size;
  }
}

rows.sort((a, b) => b[0] - a[0]);
const verbose = process.env.VERBOSE === "1";
for (const [n, f, hits] of rows) {
  console.log(String(n).padStart(4), f);
  if (verbose) for (const h of hits) console.log("       •", h);
}
console.log("\nФайлов с хардкодами:", rows.length, "| всего непереведённых строк:", total);