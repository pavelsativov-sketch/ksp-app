import { z } from "zod";
import type { SchoolProfile } from "@/lib/types/ksp";
import type { LocalObjective } from "./local";

/**
 * Официальный источник целей (ТУП): когда задан TUP_OBJECTIVES_SOURCE_URL,
 * он проверяется ПЕРВЫМ; при недоступности — тихий fallback на локальные копии.
 *
 * Ожидаемый формат ответа:
 * { "objectives": [{ "code": "5.1.2.1", "grade": 5, "text_ru": "…",
 *   "text_kz": "…"? , "section": "…"? , "profile": "all"|"emn"|"ogn"? }] }
 */

const remoteObjectiveSchema = z.object({
  code: z.string().trim().min(1).max(50),
  grade: z.coerce.number().int().min(1).max(12),
  text_ru: z.string().trim().min(1).max(2000),
  text_kz: z.string().trim().max(2000).optional(),
  section: z.string().trim().max(500).optional(),
  profile: z.enum(["all", "emn", "ogn"]).optional().default("all"),
});

const remoteResponseSchema = z.object({
  objectives: z.array(remoteObjectiveSchema).max(20000),
});

interface CacheEntry {
  at: number;
  rows: RemoteRow;
}

type RemoteRow = Array<LocalObjective & { profile: "all" | "emn" | "ogn" }>;

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, CacheEntry>();

export function remoteSourceUrl(): string | null {
  const url = (process.env.TUP_OBJECTIVES_SOURCE_URL ?? "").trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && process.env.NODE_ENV === "production") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export async function remoteTupObjectives(opts: {
  subject: string;
  grade?: number;
  search?: string;
  schoolProfile?: SchoolProfile;
}): Promise<LocalObjective[] | null> {
  const base = remoteSourceUrl();
  if (!base) return null;
  const now = Date.now();
  const cached = cache.get(base);
  const rows = cached && now - cached.at < CACHE_TTL_MS ? cached.rows : await fetchRemote(base);
  if (!rows) return null;
  const filtered = rows.filter(
    (row) =>
      (!opts.grade || row.grade === opts.grade) &&
      (row.profile === "all" || row.profile === opts.schoolProfile),
  );
  void opts.subject;
  const searched = opts.search
    ? filtered.filter((row) => {
      const q = opts.search!.toLowerCase();
      return row.code.toLowerCase().includes(q) || row.text_ru.toLowerCase().includes(q);
    })
    : filtered;
  return searched.slice(0, 500);
}

async function fetchRemote(base: string): Promise<RemoteRow | null> {
  try {
    const res = await fetch(base, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = remoteResponseSchema.safeParse(await res.json());
    if (!parsed.success) throw new Error("bad schema");
    const rows: RemoteRow = parsed.data.objectives.map((o) => ({
      id: `tup:remote:${o.profile}:${o.code}`,
      code: o.code,
      text_ru: o.text_ru,
      text_kz: o.text_kz ?? null,
      grade: o.grade,
      section: o.section ?? "Типовая учебная программа",
      profile: o.profile,
    }));
    cache.set(base, { at: Date.now(), rows });
    return rows;
  } catch (error) {
    console.warn("[tup] remote source unavailable, using local copy:", error instanceof Error ? error.message : error);
    return null;
  }
}
