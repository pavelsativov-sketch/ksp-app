#!/usr/bin/env node
/**
 * Applies SQL migrations from supabase/migrations to a Supabase Postgres DB.
 * Tracks applied migrations in the `schema_migrations` table, so it is safe
 * to re-run. Applies every *.sql file in filename order.
 *
 * Usage:
 *   node scripts/_migrate.mjs
 *
 * Connection (either one):
 *   DATABASE_URL  — full Postgres connection string, e.g.
 *     postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
 *   DB_HOST + DB_PASSWORD (user defaults to `postgres`, port to 5432)
 *
 * The database password is shown once when you create the project
 * (Supabase → Settings → Database → Connection string).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function loadEnv() {
  const envPath = path.resolve(ROOT, ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      if (!process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
}

function sslOption(host) {
  // Local docker supabase does not use TLS; remote Supabase requires it.
  return /localhost|127\.0\.0\.1/.test(host)
    ? false
    : { rejectUnauthorized: false };
}

async function main() {
  loadEnv();

  const migrationsDir = path.join(ROOT, "supabase", "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) {
    console.error("No .sql migrations found in", migrationsDir);
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD,
    database: process.env.DB_NAME || "postgres",
    ssl: sslOption(
      process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : process.env.DB_HOST || "",
    ),
    connectionTimeoutMillis: 15000,
  });

  try {
    await client.connect();
  } catch (e) {
    console.error(
      "Cannot connect to Postgres. Set DATABASE_URL (or DB_HOST + DB_PASSWORD) in .env.local.\n" +
        e.message,
    );
    process.exit(1);
  }

  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const { rows } = await client.query("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.name));

  let ran = 0;
  for (const f of files) {
    if (applied.has(f)) {
      console.log(`= ${f} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, f), "utf8");
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
      await client.query("COMMIT");
      console.log(`✓ ${f} (${sql.length} bytes)`);
      ran++;
    } catch (e) {
      await client.query("ROLLBACK");
      console.error(`✗ ${f}: ${e.message}`);
      process.exit(1);
    }
  }
  await client.end();
  console.log(`\nDone: ${ran} migration(s) applied, ${files.length} total.`);
}

main();
