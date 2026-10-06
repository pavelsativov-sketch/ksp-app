// Проверка кодировки кириллицы: ищем mojibake и сверяем ожидаемые строки.
import fs from "node:fs";

const file = process.argv[2];
const expected = process.argv.slice(3);
const t = fs.readFileSync(file, "utf8");

// Типичный признак двойного UTF-8 -> CP1251 -> UTF-8: последовательности вида РњРµС‚Р°РґР°РЅРЅС‹Рµ,
// то есть кириллица, записанная как латиница с "умными" глифами (U+0400-РЯ не совпадают с исходными).
const mojibake = [...t.matchAll(/Р[\u0400-\u04FF]|[Р-я][^\s]{0,2}Р[а-я]/g)].map((m) => m[0]);
const replacement = [...t.matchAll(/\uFFFD/g)].length;

console.log("файл:", file);
console.log("mojibake-маркеров:", mojibake.length, mojibake.slice(0, 5));
console.log("символов U+FFFD (битых):", replacement);
for (const e of expected) console.log(`содержит "${e}":`, t.includes(e));
console.log("строк:", t.split("\n").length);