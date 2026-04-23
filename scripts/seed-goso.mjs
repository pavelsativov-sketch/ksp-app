#!/usr/bin/env node
/**
 * Seed Supabase with official GOSO subjects + learning objectives (RK).
 *
 * Usage:
 *   1. Put SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY into .env.local
 *      (service_role — NOT the anon key; needed to bypass RLS for bulk insert).
 *   2. Run:  npm run seed:goso
 *
 * Idempotent — missing subjects are created, existing ones get grade range
 * extended. Objectives are deduplicated by UNIQUE(subject_id, grade, code)
 * from 0001_init.sql. Re-running this script is safe.
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

  // 1. Compute per-subject grade range from JSON
  const subjectMeta = new Map(); // name_ru -> {gmin, gmax}
  for (const group of data) {
    const entry = subjectMeta.get(group.name) ?? { gmin: 99, gmax: 0 };
    for (const obj of group.objectives) {
      const g = Number(obj.grade);
      if (g < entry.gmin) entry.gmin = g;
      if (g > entry.gmax) entry.gmax = g;
    }
    subjectMeta.set(group.name, entry);
  }

  // 2. Ensure every subject exists; read existing first
  const { data: existing, error: subjErr } = await supabase
    .from("subjects")
    .select("id, name_ru, grade_min, grade_max");
  if (subjErr) throw subjErr;
  const byName = new Map(existing.map((s) => [s.name_ru, s]));

  let inserted = 0;
  let updated = 0;
  for (const [name, { gmin, gmax }] of subjectMeta) {
    const row = byName.get(name);
    if (!row) {
      const { data: created, error } = await supabase
        .from("subjects")
        .insert({ name_ru: name, grade_min: gmin, grade_max: gmax })
        .select("id, name_ru, grade_min, grade_max")
        .single();
      if (error) throw error;
      byName.set(name, created);
      inserted++;
    } else {
      const newMin = Math.min(row.grade_min, gmin);
      const newMax = Math.max(row.grade_max, gmax);
      if (newMin !== row.grade_min || newMax !== row.grade_max) {
        const { error } = await supabase
          .from("subjects")
          .update({ grade_min: newMin, grade_max: newMax })
          .eq("id", row.id);
        if (error) throw error;
        updated++;
      }
    }
  }
  console.log(
    `Subjects: ${inserted} inserted, ${updated} grade-range updated, ${byName.size} total.`,
  );

  // 3. Build objectives rows
  const rows = [];
  let skipped = 0;
  for (const group of data) {
    const subj = byName.get(group.name);
    if (!subj) {
      console.warn(`! subject still missing after ensure: ${group.name}`);
      continue;
    }
    for (const obj of group.objectives) {
      if (!obj.code || !obj.description) {
        skipped++;
        continue;
      }
      rows.push({
        subject_id: subj.id,
        grade: Number(obj.grade),
        code: String(obj.code),
        text_ru: String(obj.description),
        text_kz: null,
        section: obj.section_name ?? null,
      });
    }
  }

  console.log(
    `Prepared ${rows.length} objectives (skipped ${skipped} malformed).`,
  );

  // 4. Upsert in batches. UNIQUE(subject_id, grade, code) handles idempotency.
  const BATCH = 500;
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("learning_objectives")
      .upsert(chunk, {
        onConflict: "subject_id,grade,code",
        ignoreDuplicates: true,
      });
    if (error) {
      console.error(`batch ${i}-${i + chunk.length} failed:`, error.message);
      process.exit(1);
    }
    done += chunk.length;
    process.stdout.write(`  ${done}/${rows.length}\r`);
  }
  console.log(`\nDone: ${done} objective rows upserted.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
