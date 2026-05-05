import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { StudentSessionPlayer } from "@/components/ksp/student-session-player";
import type { SessionTaskSnapshot } from "@/lib/types/session";

export const dynamic = "force-dynamic";

export default async function JoinSessionPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const upper = code.toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(upper)) notFound();

  if (!isSupabaseConfigured()) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("read_session_by_code", {
    p_code: upper,
  });
  if (error || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-3">
          <h1 className="text-xl font-bold">Сессия не найдена</h1>
          <p className="text-slate-600 text-sm">
            Код <span className="font-mono font-semibold">{upper}</span>{" "}
            недействителен или сессия уже закрыта. Попросите учителя выдать
            новый код.
          </p>
          <Link className="text-blue-600 text-sm hover:underline" href="/join">
            ← Ввести другой код
          </Link>
        </div>
      </div>
    );
  }

  const row = data[0] as {
    id: string;
    plan_id: string;
    status: "active" | "closed";
    tasks_snapshot: SessionTaskSnapshot[];
    expires_at: string;
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <StudentSessionPlayer
        sessionId={row.id}
        code={upper}
        tasks={row.tasks_snapshot}
      />
    </div>
  );
}
