import { NextResponse } from "next/server";
import { z } from "zod";
import { isMongoConfigured } from "@/lib/mongo";
import { checkRateLimitAsync, clientIp } from "@/lib/rate-limit";
import { localObjectives, localTupObjectives } from "@/lib/goso/local";
import { remoteTupObjectives } from "@/lib/goso/remote";
import {
  findObjectives,
  getSubjectById,
  getSubjectByName,
} from "@/lib/plans-repo";

export const runtime = "nodejs";

const querySchema = z.object({
  subjectId: z.string().trim().min(1).optional(),
  subject: z.string().trim().min(1).optional(),
  grade: z.coerce.number().int().min(1).max(12).optional(),
  search: z.string().trim().optional(),
  schoolProfile: z.enum(["emn", "ogn"]).optional(),
});

export async function GET(request: Request) {
  // Rate-limit по IP: публичный эндпоинт с $regex-поиском по БД.
  const rl = await checkRateLimitAsync(`objectives:${clientIp(request)}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Слишком много запросов. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const { subjectId, subject, grade, search, schoolProfile } = parsed.data;

  let requestedSubject = subject ?? null;
  if (!requestedSubject && subjectId && isMongoConfigured()) {
    const resolved = await getSubjectById(subjectId);
    requestedSubject = resolved?.name_ru ?? null;
  }
  const tupObjectives = requestedSubject
    ? localTupObjectives({ subject: requestedSubject, grade, search, schoolProfile })
    : null;
  // Официальный источник (если задан URL) проверяется первым.
  let remoteObjectives: Awaited<ReturnType<typeof remoteTupObjectives>> = null;
  if (requestedSubject) {
    try {
      remoteObjectives = await remoteTupObjectives({ subject: requestedSubject, grade, search, schoolProfile });
    } catch {
      remoteObjectives = null;
    }
  }
  if (remoteObjectives) {
    return NextResponse.json({
      objectives: remoteObjectives,
      source: "tup",
      note: "Официальный источник целей (ТУП).",
    });
  }
  if (tupObjectives) {
    return NextResponse.json({
      objectives: tupObjectives,
      source: "tup",
      note: "Актуальная локальная копия целей из переданных ТУП. После настройки официального сайта он будет проверяться первым.",
    });
  }

  // 1. MongoDB — канонический источник.
  if (isMongoConfigured()) {
    let resolvedSubjectId = subjectId ?? null;
    let subjectName = requestedSubject;
    try {
      if (!resolvedSubjectId && subject) {
        const s = await getSubjectByName(subject);
        resolvedSubjectId = s?.id ?? null;
      } else if (resolvedSubjectId && !subjectName) {
        const s = await getSubjectById(resolvedSubjectId);
        subjectName = s?.name_ru ?? null;
      }

      if (resolvedSubjectId) {
        const data = await findObjectives({
          subjectId: resolvedSubjectId,
          grade,
          search,
          limit: 500,
        });
        if (data.length > 0) {
          return NextResponse.json({ objectives: data, source: "db" });
        }
        // БД есть, но пусто → локальный JSON-фолбэк
        if (subjectName) {
          return NextResponse.json({
            objectives: localObjectives({ subject: subjectName, grade, search }),
            source: "local",
            note: "Временная локальная копия ТУП. Адрес официального сайта будет подключён как основной источник.",
          });
        }
        return NextResponse.json({ objectives: [], source: "db" });
      }
    } catch (e) {
      console.warn("objectives db error:", e instanceof Error ? e.message : e);
      // fall through to local
    }
  }

  // 2. Mongo не настроена/ошибка → локальный JSON
  if (!subject) {
    return NextResponse.json(
      { objectives: [], error: "subject (name) is required without MongoDB" },
      { status: 200 },
    );
  }
  return NextResponse.json({
    objectives: localObjectives({ subject, grade, search }),
    source: "local",
  });
}
