/**
 * Локальная раздача Monaco для редактора кода.
 *
 * Зачем: @monaco-editor/react по умолчанию тянет Monaco с jsdelivr. В школах
 * Казахстана внешние CDN бывают недоступны — и редактор не открывается вовсе,
 * хотя остальная ОС работает. Поэтому ассеты редактора копируются из
 * node_modules в public/monaco/vs и раздаются с нашего домена.
 *
 * Копируется весь min/vs (24 МБ, 151 файл): в monaco 0.57 это не «папка на
 * язык», а набор хешированных чанков в корне, и AMD-загрузчик подтягивает их
 * по именам — выборочное копирование ломает редактор в зависимости от того,
 * какой язык открыл учитель.
 *
 * Идемпотентно: при совпадении версии monaco-editor и слепка файлов повторный
 * запуск (npm install, npm run build) ничего не делает.
 *
 * Запуск: node scripts/copy-monaco.mjs
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const SRC_VS = path.join(root, "node_modules", "monaco-editor", "min", "vs");
const DEST = path.join(root, "public", "monaco", "vs");
const STAMP = path.join(root, "public", "monaco", ".stamp.json");
const PKG = path.join(root, "node_modules", "monaco-editor", "package.json");

if (!existsSync(SRC_VS) || !existsSync(PKG)) {
  console.warn("copy-monaco: monaco-editor не установлен — пропуск (редактор возьмёт CDN- fallback).");
  process.exit(0);
}

const version = JSON.parse(readFileSync(PKG, "utf8")).version ?? "unknown";

/** Слепок файлов: версия + число файлов + их суммарный размер. */
function fingerprint() {
  let files = 0;
  let bytes = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        files += 1;
        bytes += statSync(full).size;
      }
    }
  };
  walk(SRC_VS);
  return { version, files, bytes };
}

const print = fingerprint();
const stampPath = STAMP;
if (existsSync(stampPath) && existsSync(DEST)) {
  try {
    const done = JSON.parse(readFileSync(stampPath, "utf8"));
    if (done.version === print.version && done.files === print.files && done.bytes === print.bytes) {
      console.log(`copy-monaco: monaco-editor@${version} уже разложен в public/monaco/vs.`);
      process.exit(0);
    }
  } catch {
    // повреждённый слепок — просто копируем заново
  }
}

rmSync(path.dirname(DEST), { recursive: true, force: true });
mkdirSync(path.dirname(DEST), { recursive: true });
cpSync(SRC_VS, DEST, { recursive: true });
writeFileSync(stampPath, JSON.stringify(print, null, 2), "utf8");
console.log(
  `copy-monaco: monaco-editor@${version} разложен в public/monaco/vs — ${print.files} файлов, ${(print.bytes / 1024 / 1024).toFixed(1)} МБ.`,
);