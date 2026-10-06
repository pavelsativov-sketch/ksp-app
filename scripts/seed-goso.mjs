#!/usr/bin/env node
/**
 * Импорт официального справочника целей обучения ГОСО (РК) в MongoDB.
 *
 * Usage:
 *   1. Укажите MONGODB_URI (+ MONGODB_DB) в .env.local
 *   2. Run:  npm run seed:goso
 *
 * Идемпотентно: предметы создаются/обновляются по name_ru, цели — по
 * (subject_id, grade, code). Повторный запуск безопасен.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = path.resolve(__dirname, "..", "data", "goso_official.json");

function loadEnv() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      if (!process.env[m[1]]) {
        let val = m[2];
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[m[1]] = val;
      }
    }
  }
}

loadEnv();

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "ksp";

if (!uri) {
  console.error("Отсутствует MONGODB_URI в .env.local");
  process.exit(1);
}

async function main() {
  const raw = fs.readFileSync(JSON_PATH, "utf8");
  const groups = JSON.parse(raw); // [{ name, objectives: [{ code, description, grade, section_name, ... }] }]

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  const db = client.db(dbName);
  const subjects = db.collection("subjects");
  const objectives = db.collection("learning_objectives");

  const totalObjectives = groups.reduce((acc, g) => acc + (g.objectives?.length ?? 0), 0);
  console.log(`Предметов: ${groups.length}, целей: ${totalObjectives}. Импортируем в базу «${dbName}»…`);

  let totalOps = 0;
  for (const group of groups) {
    const nameRu = String(group.name);
    const grades = (group.objectives ?? []).map((o) => Number(o.grade)).filter(Number.isFinite);
    const gradeMin = grades.length ? Math.min(...grades) : 1;
    const gradeMax = grades.length ? Math.max(...grades) : 11;

    // 1. Предмет: upsert по name_ru (с актуальным диапазоном классов).
    await subjects.updateOne(
      { name_ru: nameRu },
      {
        $setOnInsert: { name_kz: null },
        $set: { grade_min: gradeMin, grade_max: gradeMax },
      },
      { upsert: true },
    );

    const subject = await subjects.findOne({ name_ru: nameRu }, { projection: { _id: 1 } });
    if (!subject) throw new Error(`Не удалось создать предмет «${nameRu}»`);
    const subjectId = subject._id.toString();

    // 2. Цели: upsert по (subject_id, grade, code) — идемпотентно.
    const seen = new Set();
    const ops = [];
    for (const o of group.objectives ?? []) {
      if (!o.code || !o.description) continue;
      const grade = Number(o.grade);
      const code = String(o.code);
      const key = `${grade}:${code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ops.push({
        updateOne: {
          filter: { subject_id: subjectId, grade, code },
          update: {
            $set: {
              text_ru: String(o.description),
              section: o.section_name ?? null,
            },
          },
          upsert: true,
        },
      });
    }
    for (let i = 0; i < ops.length; i += 500) {
      const slice = ops.slice(i, i + 500);
      const res = await objectives.bulkWrite(slice, { ordered: false });
      totalOps += res.upsertedCount + res.modifiedCount + res.matchedCount;
    }
    console.log(`  ✓ ${nameRu}: ${ops.length} целей`);
  }

  console.log(`Готово. Обработано операций по целям: ${totalOps}.`);
  await client.close();
}

main().catch((err) => {
  console.error("seed:goso failed:", err);
  process.exit(1);
});
