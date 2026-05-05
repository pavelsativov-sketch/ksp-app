import { notFound, redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { SessionLiveBoard } from "@/components/ksp/session-live-board";
import type {
  LessonSessionRow,
  SessionResponseRow,
} from "@/lib/types/session";

export const dynamic = "force-dynamic";

export default async function SessionLivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isSupabaseConfigured()) redirect("/");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/sessions/${id}`);

  const { data: sessionData, error } = await supabase
    .from("lesson_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !sessionData) notFound();
  const session = sessionData as LessonSessionRow;
  if (session.owner_id !== user.id) notFound();

  const { data: responsesData } = await supabase
    .from("session_responses")
    .select(
      "id, session_id, student_name, task_index, task_label, response_data, is_correct, score, max_score, created_at",
    )
    .eq("session_id", id)
    .order("created_at", { ascending: true });
  const initialResponses = (responsesData ?? []) as SessionResponseRow[];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Live-сессия</h1>
        <p className="text-slate-500 text-sm">
          Ученики подключаются на{" "}
          <span className="font-mono">/join/{session.code}</span>. Обновляется
          автоматически каждые 3 секунды.
        </p>
      </div>
      <SessionLiveBoard session={session} initialResponses={initialResponses} />
    </div>
  );
}
