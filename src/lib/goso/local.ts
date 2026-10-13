/**
 * Offline-справочник целей обучения ГОСО.
 *
 * Используется, когда MongoDB не настроена или таблица `learning_objectives`
 * пуста (`npm run seed:goso` ещё не запущен).
 *
 * Источник истины: `data/goso_official.json` — 5 461 цель обучения,
 * 24 предмета РК, классы 1–11. JSON читается ОДИН раз на холодный старт.
 */

import fs from "node:fs";
import path from "node:path";
import type { SchoolProfile } from "@/lib/types/ksp";

export interface LocalObjective {
  id: string; // synthetic: `${subjectSlug}-${grade}-${code}`
  code: string;
  text_ru: string;
  text_kz: string | null;
  grade: number;
  section: string | null;
}

interface RawObjective {
  code: string;
  description: string;
  grade: number;
  section: number | null;
  subsection: number | null;
  objective_num: number | null;
  section_name: string | null;
}

interface RawGroup {
  name: string;
  objectives: RawObjective[];
}

let cache: {
  bySubject: Map<string, LocalObjective[]>;
  subjectMeta: Map<string, { gmin: number; gmax: number }>;
} | null = null;

function load() {
  if (cache) return cache;
  const file = path.resolve(process.cwd(), "data", "goso_official.json");
  if (!fs.existsSync(file)) {
    cache = { bySubject: new Map(), subjectMeta: new Map() };
    return cache;
  }
  const raw = fs.readFileSync(file, "utf8");
  const groups = JSON.parse(raw) as RawGroup[];
  const bySubject = new Map<string, LocalObjective[]>();
  const subjectMeta = new Map<string, { gmin: number; gmax: number }>();
  for (const g of groups) {
    const list = bySubject.get(g.name) ?? [];
    const meta = subjectMeta.get(g.name) ?? { gmin: 99, gmax: 0 };
    const seen = new Set(list.map((o) => `${o.grade}:${o.code}`));
    for (const o of g.objectives) {
      if (!o.code || !o.description) continue;
      const key = `${o.grade}:${o.code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({
        id: `goso:${g.name}:${o.grade}:${o.code}`,
        code: String(o.code),
        text_ru: String(o.description),
        text_kz: null,
        grade: Number(o.grade),
        section: o.section_name ?? null,
      });
      if (o.grade < meta.gmin) meta.gmin = o.grade;
      if (o.grade > meta.gmax) meta.gmax = o.grade;
    }
    bySubject.set(g.name, list);
    subjectMeta.set(g.name, meta);
  }
  // Sort each subject's objectives by code so the picker is stable.
  for (const list of bySubject.values()) {
    list.sort((a, b) => a.code.localeCompare(b.code, "ru", { numeric: true }));
  }
  cache = { bySubject, subjectMeta };
  return cache;
}

export function localObjectives(opts: {
  subject: string;
  grade?: number;
  search?: string;
  limit?: number;
}): LocalObjective[] {
  const { bySubject } = load();
  const list = bySubject.get(opts.subject) ?? [];
  let result = opts.grade !== undefined ? list.filter((o) => o.grade === opts.grade) : list;
  if (opts.search) {
    const q = opts.search.trim().toLowerCase();
    result = result.filter(
      (o) =>
        o.code.toLowerCase().includes(q) ||
        o.text_ru.toLowerCase().includes(q) ||
        (o.section?.toLowerCase().includes(q) ?? false),
    );
  }
  return result.slice(0, opts.limit ?? 500);
}

interface TupObjective {
  code: string;
  grade: number;
  text_ru: string;
  profile: "all" | SchoolProfile;
}

let tupCache: TupObjective[] | null = null;

/** Current TUP documents supplied for Informatics. */
export function localTupObjectives(opts: {
  subject: string;
  grade?: number;
  search?: string;
  schoolProfile?: SchoolProfile;
}): LocalObjective[] | null {
  if (!/информатик/i.test(opts.subject)) return null;
  if (!tupCache) {
    const file = path.resolve(process.cwd(), "data", "tup_informatics_current.json");
    if (!fs.existsSync(file)) return null;
    tupCache = JSON.parse(fs.readFileSync(file, "utf8")) as TupObjective[];
  }
  let rows = tupCache.filter((row) =>
    opts.grade === undefined || row.grade === opts.grade,
  );
  rows = rows.filter((row) => row.profile === "all" || row.profile === opts.schoolProfile);
  if (opts.search) {
    const query = opts.search.toLowerCase();
    rows = rows.filter((row) => row.code.includes(query) || row.text_ru.toLowerCase().includes(query));
  }
  return rows.map((row) => ({
    id: `tup:informatics:${row.profile}:${row.code}`,
    code: row.code,
    text_ru: row.text_ru.replace(/\s+[1-4]\s*четверть[\s\S]*$/i, "").trim(),
    text_kz: null,
    grade: row.grade,
    section: "Типовая учебная программа",
  }));
}

export function localSubjects(): Array<{ name_ru: string; grade_min: number; grade_max: number }> {
  const { subjectMeta } = load();
  return Array.from(subjectMeta.entries())
    .map(([name, m]) => ({ name_ru: name, grade_min: m.gmin, grade_max: m.gmax }))
    .sort((a, b) => a.name_ru.localeCompare(b.name_ru, "ru"));
}
