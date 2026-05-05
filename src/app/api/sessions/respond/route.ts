import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { evaluateTask, type TaskAnswer } from "@/lib/ksp/tasks";
import type { LessonSessionRow, SessionTaskSnapshot } from "@/lib/types/session";

export const runtime = "nodejs";

interface RespondInput {
  sessionId?: string;
  code?: string;
  studentName?: string;
  taskIndex?: number;
  answer?: TaskAnswer;
}

const MAX_NAME = 80;

function sanitizeName(s: string): string {
  return s.trim().slice(0, MAX_NAME).replace(/\s+/g, " ");
}

/**
 * Anonymous student endpoint. Accepts a session code + student name +
 * task answer, grades it, and inserts a row into session_responses.
 *
 * Returns the grading result so the student sees immediate feedback.
 */
export async function POST(req: Request) {
  let body: RespondInput;
  try {
    body = (await req.json()) as RespondInput;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const studentName = sanitizeName(body.studentName ?? "");
  if (!studentName) {
    return NextResponse.json({ error: "Введите имя" }, { status: 400 });
  }
  if (typeof body.taskIndex !== "number" || body.taskIndex < 0) {
    return NextResponse.json({ error: "Bad task index" }, { status: 400 });
  }
  if (!body.answer || typeof body.answer !== "object") {
    return NextResponse.json({ error: "Bad answer" }, { status: 400 });
  }

  const supabase = await createClient();

  // Resolve session by id or code (uppercase). RLS lets anon read active
  // sessions, so this works without auth.
  let session: LessonSessionRow | null = null;
  if (body.sessionId) {
    const { data } = await supabase
      .from("lesson_sessions")
      .select("*")
      .eq("id", body.sessionId)
      .maybeSingle();
    session = (data as LessonSessionRow | null) ?? null;
  } else if (body.code) {
    const { data } = await supabase.rpc("read_session_by_code", {
      p_code: body.code.toUpperCase(),
    });
    if (Array.isArray(data) && data.length > 0) {
      const r = data[0] as Pick<
        LessonSessionRow,
        "id" | "plan_id" | "status" | "tasks_snapshot" | "expires_at"
      >;
      session = {
        ...r,
        owner_id: "",
        code: body.code.toUpperCase(),
        created_at: "",
        closed_at: null,
      } as LessonSessionRow;
    }
  }
  if (!session) {
    return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
  }
  if (session.status !== "active") {
    return NextResponse.json({ error: "Сессия закрыта" }, { status: 410 });
  }

  const snapshot = session.tasks_snapshot as SessionTaskSnapshot[];
  const slot = snapshot.find((s) => s.index === body.taskIndex);
  if (!slot) {
    return NextResponse.json({ error: "Задание не найдено" }, { status: 400 });
  }

  const result = evaluateTask(slot.task, body.answer);

  const { error: insertErr } = await supabase
    .from("session_responses")
    .insert({
      session_id: session.id,
      student_name: studentName,
      task_index: body.taskIndex,
      task_label: slot.task.question?.slice(0, 200) ?? null,
      response_data: body.answer as unknown as Record<string, unknown>,
      is_correct: result.isCorrect,
      score: result.score,
      max_score: result.maxScore,
    });
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 400 });
  }

  return NextResponse.json({ result });
}
