import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SessionResponseRow } from "@/lib/types/session";

export const runtime = "nodejs";

/**
 * Teacher-side polling endpoint. Returns all responses to a session — RLS
 * enforces that only the session owner can read these rows.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("session_responses")
    .select(
      "id, session_id, student_name, task_index, task_label, response_data, is_correct, score, max_score, created_at",
    )
    .eq("session_id", id)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    responses: (data ?? []) as SessionResponseRow[],
  });
}
