/** Live provider smoke test. Deliberately spends AI requests; does not create users or plans. */
import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import JSZip from "jszip";

config({ path: ".env.local" });
// Provider telemetry is unrelated to this smoke test; keep it out of the real database.
delete process.env.MONGODB_URI;
const cwd = process.cwd();
const tmp = join(cwd, ".tmp-live-handout");
const failures = [];
const check = (name, condition, extra = "") => {
  console.log(`${condition ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!condition) failures.push(name);
};
async function load(entry, name) {
  const result = spawnSync(process.execPath, [
    join(cwd, "node_modules/esbuild/bin/esbuild"), join(cwd, "src/lib", entry),
    "--bundle", "--platform=node", "--format=esm", "--packages=external",
    "--alias:@=" + join(cwd, "src").replace(/\\/g, "/"),
    "--alias:server-only=" + join(tmp, "server-only.js").replace(/\\/g, "/"),
    "--outfile=" + join(tmp, name),
  ], { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "Bundle failed");
  return import(pathToFileURL(join(tmp, name)).href);
}
async function inspectDocx(buffer, expectedImages = 0) {
  const zip = await JSZip.loadAsync(buffer);
  const media = Object.values(zip.files).filter((f) => !f.dir && f.name.startsWith("word/media/"));
  const xml = await zip.file("word/document.xml").async("string");
  const drawings = (xml.match(/<w:drawing>/g) || []).length;
  check("DOCX: рисунки встроены и используются", media.length === expectedImages && drawings === expectedImages, `${media.length} файлов, ${drawings} рисунков`);
  return xml;
}
async function scenario(name, run) {
  console.log(`\n${name}`);
  try { await run(); }
  catch (error) { failures.push(name); console.error("FAIL " + (error?.message || "Unknown failure")); }
}
try {
  mkdirSync(tmp, { recursive: true });
  writeFileSync(join(tmp, "server-only.js"), "export default {};\n");
  const { generateHandout } = await load("handouts/generate.ts", "handouts.mjs");
  const { buildHandoutDocx } = await load("handouts/docx.ts", "handout-docx.mjs");
  const { generateKsp, mergeAiIntoKsp } = await load("ai/generate.ts", "ksp.mjs");
  const { emptyKsp } = await load("types/ksp.ts", "types.mjs");
  const { buildKspDocx, buildTeacherScriptDocx } = await load("export/docx.ts", "export.mjs");
  const ctx = { topic: "Обыкновенные дроби", subject: "Математика", grade: 5, language: "ru" };
  for (const [kind, count] of [["worksheet", 3], ["flashcards", 4]]) {
    await scenario(kind, async () => {
      const handout = await generateHandout({ ...ctx, kind, count, withImages: true });
      const items = kind === "worksheet" ? handout.tasks : handout.cards;
      const images = items.filter((item) => item.imageBase64).length;
      check(`${kind}: реальный AI-текст`, !handout.stub && items.length === count);
      check(`${kind}: все изображения получены`, images === count, `${images}/${count}`);
      if (kind === "worksheet") check("worksheet: сумма баллов 10", items.reduce((sum, item) => sum + item.points, 0) === 10);
      await inspectDocx(await buildHandoutDocx(handout), images);
    });
  }
  await scenario("КСП + слова педагога", async () => {
    const ai = await generateKsp({ ...ctx, learningObjectives: ["Читать и записывать обыкновенные дроби"] });
    const content = mergeAiIntoKsp(emptyKsp(), ai);
    content.header.grade = "5";
    const plan = { id: "live-test", owner_id: "test", title: ctx.topic, subject_id: null,
      grade: 5, quarter: 1, section: null, visibility: "private", language: "ru",
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(), content };
    for (const [stage, value] of Object.entries(content.stages)) {
      check(`КСП: ${stage} содержит речь педагога`, value.teacherActions.includes("Слова педагога:") && value.teacherActions.length > 300);
    }
    const kspXml = await inspectDocx(await buildKspDocx(plan));
    check("КСП: тема присутствует в DOCX", kspXml.includes(ctx.topic));
    const scriptXml = await inspectDocx(await buildTeacherScriptDocx(plan));
    check("Слова педагога: все этапы экспортированы", ["Начало урока", "Середина урока", "Конец урока"].every((s) => scriptXml.includes(s)));
    check("Слова педагога: нет пустого сценария", scriptXml.includes("Слова педагога:") && !scriptXml.includes("пока не заполнен"));
  });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(failures.length ? `\nLIVE: FAIL (${failures.join(", ")})` : "\nLIVE: ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ");
process.exitCode = failures.length ? 1 : 0;
