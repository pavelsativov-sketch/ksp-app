const fs = require("fs");
let text = fs.readFileSync("src/lib/i18n/dictionaries.ts", "utf8");

// find "const ru = {"
const ruStart = text.indexOf("const ru = {");
// find "export type Dict"
const dictStart = text.indexOf("export type Dict = typeof ru;");
const ruText = text.substring(ruStart + 11, dictStart).trim();

// replace the kk object with a copy of ru
const newText = text.substring(0, dictStart) + "export type Dict = typeof ru;\n\nconst kk: Dict = " + ruText + "\n\nexport const dictionaries: Record<Locale, Dict> = { ru, kk };\n\nexport function isLocale(value: unknown): value is Locale {\n  return value === \"ru\" || value === \"kk\";\n}\n";

fs.writeFileSync("src/lib/i18n/dictionaries.ts", newText);
console.log("Fixed kk to match ru");