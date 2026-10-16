/**
 * postinstall: воркараунды react#37321 для next 16.3.6 — ПОЛНАЯ ЗАМЕНА
 * patch-package. Идемпотентный: вставка происходит только если маркер
 * PATCH(react#37321) в целевом файле отсутствует, поэтому повторные запуски
 * (npm install, npm ci, существующая node_modules) — безопасны.
 *
 * Список правок == patches/next+16.3.6.patch:
 *  1) dist/compiled/scheduler/cjs/scheduler.production.js  — ворота на loading
 *  2) dist/compiled/react-dom/cjs/react-dom-client.production.js — ре-вывод
 *     курсора клайма из живого DOM (главный фикс ложного fatal #418)
 *  3/4) dist/{client,esm}/client/app-index.js — hydrate() ждёт DOMContentLoaded
 */

import { readFileSync, writeFileSync } from "node:fs";
import { rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const FIX = "PATCH(react#37321)";
const files = [
  "dist/compiled/scheduler/cjs/scheduler.production.js",
  "dist/compiled/react-dom/cjs/react-dom-client.production.js",
  "dist/client/app-index.js",
  "dist/esm/client/app-index.js",
];

// 1) scheduler: не стартуем работу, пока документ в состоянии loading.
const schedGate =
  "function performWorkUntilDeadline() {\n" +
  "  /* " + FIX + "): гидрация стартует раньше окончания парсинга HTML.\n" +
  "     Если граница сетевого чанка придёт между <body> и первым элементом,\n" +
  "     claim-проход React не найдёт узел и бросит ложный fatal #418 — весь SSR\n" +
  "     DOM перепишется обычным рендером. Пока документ в состоянии loading,\n" +
  "     откладываем работу на 8 мс. */\n" +
  "  if (\n" +
  '    "undefined" !== typeof document &&\n' +
  "    null !== document &&\n" +
  '    "loading" === document.readyState\n' +
  "  ) {\n" +
  "    isMessageLoopRunning && localSetTimeout(performWorkUntilDeadline, 8);\n" +
  "    return;\n" +
  "  }\n" +
  "  needsPaint = !1;\n" +
  "  if (isMessageLoopRunning) {";
const schedAnchor =
  "function performWorkUntilDeadline() {\n  needsPaint = !1;\n  if (isMessageLoopRunning) {";

// 2) react-dom: ре-вывод курсора клайма из живого DOM.
const rdomAnchor =
  "    instance = getNextHydratable(instance.nextSibling);\n" +
  "    if (null === instance) break;\n" +
  "  }\n" +
  "  return null;\n" +
  "}\n" +
  "function canHydrateTextInstance(instance, text, inRootOrSingleton) {";
const rdomGate =
  "    instance = getNextHydratable(instance.nextSibling);\n" +
  "    if (null === instance) break;\n" +
  "  }\n" +
  "  /* " + FIX + "): при стриминге SSR курсор клайма может «застрять» в\n" +
  "     head-зоне (singleton-контекст не пере-выводится после заявки элемента\n" +
  "     из head) и исчерпать обход до body — тогда React бросает ложный fatal\n" +
  "     #418 (args[]=HTML) и переписывает весь корректный SSR DOM обычным\n" +
  "     рендером. Если документ уже допарсен, а целевой элемент стоит недалеко\n" +
  "     от начала body — пере-выводим клайм из живого DOM: следующий шаг курсора\n" +
  "     (getNextHydratable(node.nextSibling)) продолжится уже с найденного узла,\n" +
  "     и все следующие заявки выровняются. */\n" +
  "  if (\n" +
  "    inRootOrSingleton &&\n" +
  '    "undefined" !== typeof document &&\n' +
  "    null !== document &&\n" +
  "    null !== document.body &&\n" +
  '    "loading" !== document.readyState\n' +
  "  ) {\n" +
  "    var kids = document.body.children;\n" +
  "    for (var k = kids[0] && kids[0].hidden ? 1 : 0; k < kids.length; k++) {\n" +
  "      if (kids[k].nodeName.toLowerCase() === type.toLowerCase()) {\n" +
  "        return kids[k];\n" +
  "      }\n" +
  "    }\n" +
  "  }\n" +
  "  return null;\n" +
  "}\n" +
  "function canHydrateTextInstance(instance, text, inRootOrSingleton) {";

// 3/4) app-index: hydrate() ждёт окончания парсинга документа.
const appIdxAnchor =
  "async function hydrate(instrumentationModules, assetPrefix) {\n" +
  "    let staticIndicatorState;";
const appIdxGate =
  "async function hydrate(instrumentationModules, assetPrefix) {\n" +
  "    // " + FIX + "): гидрация не должна стартовать, пока HTML ещё\n" +
  "    // парсится: иначе claim-проход может наткнуться на оборванный чанк между\n" +
  "    // <body> и первым элементом и бросить ложный fatal #418 (args[]=HTML).\n" +
  "    // Ждём окончания парсинга документа.\n" +
  "    if (typeof document !== 'undefined' && document.readyState === 'loading') {\n" +
  "        await new Promise((resolve)=>{\n" +
  "            document.addEventListener('DOMContentLoaded', resolve, {\n" +
  "                once: true\n" +
  "            });\n" +
  "        });\n" +
  "    }\n" +
  "    let staticIndicatorState;";

function patchFile(rel, anchor, replacement) {
  const abs = path.join(root, "node_modules", "next", rel);
  let src;
  try {
    src = readFileSync(abs, "utf8");
  } catch {
    console.warn(`postinstall-418: пропущен (нет файла): ${rel}`);
    return { rel, state: "skip" };
  }
  if (src.includes(FIX)) {
    return { rel, state: "already" };
  }
  const parts = src.split(anchor);
  if (parts.length !== 2) {
    console.warn(
      `postinstall-418: НЕПОНИМАЕМЫЙ файл (якорь встретился ${parts.length} раз): ${rel}`,
    );
    return { rel, state: "anchor-fail" };
  }
  writeFileSync(abs, parts.join(replacement), "utf8");
  return { rel, state: "patched" };
}

const results = [];
results.push(patchFile(files[0], schedAnchor, schedGate));
results.push(patchFile(files[1], rdomAnchor, rdomGate));
results.push(patchFile(files[2], appIdxAnchor, appIdxGate));
results.push(patchFile(files[3], appIdxAnchor, appIdxGate));

const patched = results.filter((r) => r.state === "patched").length;
const already = results.filter((r) => r.state === "already").length;
const failed = results.filter((r) => r.state === "anchor-fail").length;

/* Кэш webpack (.next/cache) переживает смену файлов next: модуль compiled
   react-dom может переехать в новый билд без пересборки — это и погубило
   первые прод-деплои (правленый файл на диске, страница собирается из
   устаревшего скомпилированного артефакта). Воркараунды ставятся в
   postinstall — к моменту билда кэш нужно получить чистым. */
let purged = 0;
const nextCache = path.join(root, ".next");
try {
  rmSync(nextCache, { recursive: true, force: true });
  purged = 1;
} catch (e) {
  console.warn("postinstall-418: не удалось удалить .next:", String(e).slice(0, 120));
}

for (const r of results) {
  console.log(`postinstall-418: ${r.rel} -> ${r.state}`);
}
if (failed > 0) {
  console.warn("postinstall-418: предупреждение — часть файлов не удалось пропатчить.");
}
console.log(
  `postinstall-418: пропатчено ${patched}, уже были ${already}, сбои ${failed}, кэш .next очищен ${purged}.`,
);
