import { NextResponse } from "next/server";
import { getDb, COL, isMongoConfigured } from "@/lib/mongo";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RoomStudent {
  name?: string;
  score?: number;
  answered?: number;
}

interface RoomDoc {
  code: string;
  ownerId?: string | null;
  students?: Record<string, RoomStudent>;
}

function csvCell(value: string | number): string {
  const s = String(value);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * GET /api/quiz/[code]/results — результаты live-квиза в CSV для учителя.
 * Доступен только владельцу комнаты (хост-подключение).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!isMongoConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 500 });
  const { code } = await params;
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "Invalid code" }, { status: 400 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });

  const rl = await checkRateLimitAsync(`quiz:results:${user.id}`, 20, 3600_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const db = await getDb();
  const room = await db.collection<RoomDoc>(COL.quizRooms).findOne({ code });
  if (!room) return NextResponse.json({ error: "Комната не найдена" }, { status: 404 });
  if (room.ownerId !== user.id) {
    return NextResponse.json({ error: "Доступ только для ведущего квиза" }, { status: 403 });
  }

  const rows = Object.entries(room.students ?? {})
    .map(([studentId, s]) => ({
      name: s.name || "Ученик",
      score: s.score ?? 0,
      answered: s.answered ?? 0,
      studentId,
    }))
    .sort((a, b) => b.score - a.score);

  const lines = [
    ["Место", "Имя", "Очки", "Ответов"].map(csvCell).join(";"),
    ...rows.map((r, i) =>
      [i + 1, r.name, r.score, r.answered].map(csvCell).join(";"),
    ),
  ];
  // BOM для корректного открытия кириллицы в Excel.
  const csv = "\uFEFF" + lines.join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="quiz-${code}-results.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
