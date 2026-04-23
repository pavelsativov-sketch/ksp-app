#!/usr/bin/env node
/**
 * Seed Supabase with official GOSO learning objectives (RK).
 *
 * Usage:
 *   1. Apply supabase/migrations/0003_goso_subjects.sql in SQL Editor first
 *      (creates subjects.name_ru unique constraint and upserts all subjects).
 *   2. Put SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY into .env.local
 *      (service_role — NOT the anon key; needed to bypass RLS for bulk insert).
 *   3. Run:  node scripts/seed-goso.mjs
 *
 * The script is idempotent — re-running skips rows that already exist
 * (thanks to UNIQUE(subject_id, grade, code) in 0001_init.sql).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = path.resolve(__dirname, "..", "supabase", "data", "goso_official.json");

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

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const raw = fs.readFileSync(JSON_PATH, "utf8");
  const data = JSON.parse(raw);

  // 1. Map subject name -> uuid
  const { data: subjects, error: subjErr } = await supabase
    .from("subjects")
    .select("id, name_ru");
  if (subjErr) throw subjErr;
  const subjectId = new Map(subjects.map((s) => [s.name_ru, s.id]));

  // 2. Build objectives rows
  const rows = [];
  let skipped = 0;
  for (const group of data) {
    const sid = subjectId.get(group.name);
    if (!sid) {
      console.warn(
        `! subject not found in DB: ${group.name} — did you run 0003_goso_subjects.sql?`,
      );
      continue;
    }
    for (const obj of group.objectives) {
      if (!obj.code || !obj.description) {
        skipped++;
        continue;
      }
      rows.push({
        subject_id: sid,
        grade: Number(obj.grade),
        code: String(obj.code),
        text_ru: String(obj.description),
        text_kz: null,
        section: obj.section_name ?? null,
      });
    }
  }

  console.log(
    `Prepared ${rows.length} objectives (skipped ${skipped} malformed) for ${subjects.length} subjects.`,
  );

  // 3. Upsert in batches. UNIQUE(subject_id, grade, code) handles idempotency.
  const BATCH = 500;
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("learning_objectives")
      .upsert(chunk, { onConflict: "subject_id,grade,code", ignoreDuplicates: true });
    if (error) {
      console.error(`batch ${i}-${i + chunk.length} failed:`, error.message);
      process.exit(1);
    }
    done += chunk.length;
    process.stdout.write(`  ${done}/${rows.length}\r`);
  }
  console.log(`\nDone: ${done} rows upserted.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
