/**
 * Живая интеграционная проверка истории версий против реальной MongoDB.
 *
 * Что делает:
 * 1. Бандлит реальный src/lib/plan-versions.ts через esbuild (алиас @/ → src/,
 *    server-only подменяется пустышкой).
 * 2. Создаёт временный план в БД и прогоняет реальные вызовы: сохранение ×2,
 *    восстановление версии, конфликт timestamp, изоляция владельца.
 * 3. Полностью удаляет план, версии и временного пользователя-владельца.
 * Никаких AI-вызовов. Посторонние данные не трогает.
 *
 * Запуск: node scripts/live-verify-plan-history.mjs
 */
import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

config({ path: ".env.local" });
if (!process.env.MONGODB_URI) {
  console.log("MONGODB_URI не настроен — проверка пропущена.");
  process.exit(0);
}

const cwd = process.cwd();
const tmpDir = join(cwd, ".tmp-live-verify");
mkdirSync(tmpDir, { recursive: true });
writeFileSync(join(tmpDir, "server-only.js"), "export default {};\n");

const bundlePath = join(tmpDir, "plan-versions.bundle.mjs");
const build = spawnSync(process.execPath, [
  join(cwd, "node_modules", "esbuild", "bin", "esbuild"),
  join(cwd, "src", "lib", "plan-versions.ts"),
  "--bundle", "--platform=node", "--format=esm",
  "--alias:@" + "=" + join(cwd, "src").replace(/\\/g, "/") + "/",
  "--alias:server-only=" + join(tmpDir, "server-only.js").replace(/\\/g, "/"),
  `--outfile=${bundlePath}`,
  "--external:mongodb",
], { cwd, encoding: "utf8" });
if (build.status !== 0) {
  console.log("ESBUILD-FAIL:\n" + (build.stderr || build.stdout));
  process.exit(1);
}

const { MongoClient, ObjectId } = await import("mongodb");
const { updatePlanWithVersion, getPlanHistory, deletePlanWithVersions } = await import(pathToFileURL(bundlePath).href);

const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
const db = client.db(process.env.MONGODB_DB || "ksp");
const ownerId = new ObjectId();
const planId = new ObjectId();
const now = new Date();
let failures = 0;
const check = (name, cond, extra = "") => {
  console.log((cond ? "PASS " : "FAIL ") + name + (extra ? " — " + extra : ""));
  if (!cond) failures++;
};
const emptyContent = (topic) => ({
  topic, schoolProfile: "emn", learningObjectives: [],
  stages: { beginning: { goals: [], criteria: [], tasks: [] }, middle: { goals: [], criteria: [], tasks: [] }, end: { goals: [], criteria: [], tasks: [] } },
  resources: [], homework: null,
});

try {
  await client.connect();
  await db.collection("lesson_plans").insertOne({
    _id: planId,
    owner_id: ownerId.toHexString(),
    title: "История: проверка v1",
    subject_id: null, grade: 5, quarter: 1, section: null,
    visibility: "private", language: "ru",
    content: emptyContent("Тема проверки"),
    created_at: now, updated_at: now,
  });

  // 1) Первое изменение: снимок предыдущего состояния появляется после него.
  const r1 = await updatePlanWithVersion(planId.toHexString(), ownerId.toHexString(), now.toISOString(), {
    reason: "save",
    state: { title: "История v2", subject_id: null, grade: 5, quarter: 1, section: null, visibility: "private", language: "ru", is_draft: false, content: emptyContent("Тема проверки v2") },
  });
  check("первое сохранение вернуло updated_at", typeof r1?.updated_at === "string");
  let versions = (await getPlanHistory(planId.toHexString(), ownerId.toHexString()))?.versions ?? [];
  check("после первого изменения 1 снимок", versions.length === 1, "получено " + versions.length);

  // 2) Второе изменение — второй снимок.
  const r2 = await updatePlanWithVersion(planId.toHexString(), ownerId.toHexString(), r1.updated_at, {
    reason: "save",
    state: { title: "История v3", subject_id: null, grade: 5, quarter: 1, section: null, visibility: "private", language: "ru", is_draft: false, content: emptyContent("Тема проверки v3") },
  });
  check("второе сохранение вернуло updated_at", typeof r2?.updated_at === "string");

  // 3) Восстановление снимка v1; видимость не меняется.
  versions = (await getPlanHistory(planId.toHexString(), ownerId.toHexString()))?.versions ?? [];
  const restoreTarget = versions.find((v) => v.plan.content?.topic === "Тема проверки");
  check("снимок v1 найден в истории", Boolean(restoreTarget));
  const r3 = await updatePlanWithVersion(planId.toHexString(), ownerId.toHexString(), r2.updated_at, { versionId: restoreTarget.id });
  check("восстановление вернуло updated_at", typeof r3?.updated_at === "string");
  const restored = await db.collection("lesson_plans").findOne({ _id: planId });
  check("восстановление вернуло тему v1", restored?.content?.topic === "Тема проверки");
  check("восстановление сохранило видимость private", restored?.visibility === "private");

  // 4) Устаревший timestamp отклоняется (конкурентная защита).
  let conflictCaught = false;
  try {
    await updatePlanWithVersion(planId.toHexString(), ownerId.toHexString(), now.toISOString(), {
      reason: "save",
      state: { title: "x", subject_id: null, grade: 1, quarter: null, section: null, visibility: "private", language: "ru", is_draft: false, content: emptyContent("x") },
    });
  } catch (e) { conflictCaught = String(e.message).includes("План изменился"); }
  check("устаревший timestamp отклоняется", conflictCaught);

  // 5) Чужой владелец не видит план и историю.
  const foreign = await getPlanHistory(planId.toHexString(), new ObjectId().toHexString());
  check("чужой не видит план/историю", foreign === null);

  const finalCount = (await getPlanHistory(planId.toHexString(), ownerId.toHexString()))?.versions.length ?? -1;
  check("снимков ровно 3", finalCount === 3, "снимков: " + finalCount);
} catch (e) {
  failures++;
  console.log("НЕОЖИДАННЫЙ СБОЙ: " + e.message);
} finally {
  try {
    await deletePlanWithVersions(planId.toHexString(), ownerId.toHexString());
  } catch (e) { console.log("cleanup plan: " + e.message); }
  try {
    const leftPlans = await db.collection("lesson_plans").countDocuments({ _id: planId });
    const leftVersions = await db.collection("lesson_plan_versions").countDocuments({ plan_id: planId.toHexString() });
    await db.collection("users").deleteOne({ _id: ownerId });
    check("план и версии удалены при очистке", leftPlans === 0 && leftVersions === 0, `планов: ${leftPlans}, версий: ${leftVersions}`);
  } catch (e) { console.log("cleanup: " + e.message); }
  await client.close();
  rmSync(tmpDir, { recursive: true, force: true });
}
console.log(failures === 0 ? "\nLIVE-VERIFY: ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ" : "\nLIVE-VERIFY: ЕСТЬ ПРОВАЛЫ: " + failures);
process.exit(failures === 0 ? 0 : 1);
