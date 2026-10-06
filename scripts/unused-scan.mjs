// Сканер мёртвого кода: файлы в src/, которые никто не импортирует.
// Запуск: node scripts/unused-scan.mjs
import fs from "node:fs";
import path from "node:path";

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = [...walk("src"), ...walk("tests")];
const sources = files.map((f) => [f, fs.readFileSync(f, "utf8")]);
const norm = (p) => p.replace(/\\/g, "/").replace(/^\.\//, "");

// Индекс: путь модуля без расширения -> какие файлы его импортируют
const byKey = new Map();
const add = (key, importer) => {
  if (!byKey.has(key)) byKey.set(key, new Set());
  byKey.get(key).add(importer);
};
for (const [f, text] of sources) {
  for (const m of text.matchAll(/["'`](@\/[a-zA-Z0-9_\-./]+)["'`]/g)) {
    add(norm(m[1]).replace(/^@\//, "").replace(/\.(ts|tsx)$/, ""), norm(f));
  }
  for (const m of text.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
    const abs = norm(path.join(path.dirname(norm(f)), m[1]));
    add(abs.replace(/\.(ts|tsx)$/, "").replace(/^src\//, ""), norm(f));
  }
}

const isTest = (f) => /\.(test|spec)\.(ts|tsx)$/.test(f);
// Роуты Next.js и соглашения фреймворка попадают под file-system routing,
// а не под импорты — их исключаем, иначе они все выглядят мёртвыми.
const isFrameworkEntry = (f) =>
  /(^|\/)route\.ts$/.test(f) ||
  /(^|\/)(page|layout|error|global-error|not-found|template)\.tsx$/.test(f) ||
  /(^|\/)(robots|sitemap|opengraph-image|manifest)\.ts$/.test(f) ||
  /(^|\/)(proxy|instrumentation)\.ts$/.test(f) ||
  /(^|\/)layout\.(ts|tsx)$/.test(f) ||
  /\/(dictionaries|index)\.ts$/.test(f);

const dead = [];
for (const [f] of sources) {
  const p = norm(f);
  if (isTest(p) || isFrameworkEntry(p)) continue;
  const key = p.replace(/\.(ts|tsx)$/, "").replace(/^src\//, "");
  const users = [...(byKey.get(key) || [])].filter((u) => u !== p && !isTest(u));
  if (users.length === 0) dead.push([p, byKey.has(key) ? "only-self" : "no-imports"]);
}

const lines = (f) => fs.readFileSync(f, "utf8").split("\n").length;
console.log("=== МЁРТВЫЙ КОД (никем не импортируется) ===");
for (const [f, why] of dead.sort()) {
  console.log(String(lines(f)).padStart(5), f, `(${why})`);
}
console.log("\nВсего:", dead.length, "из", files.length, "файлов");