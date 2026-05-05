"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateSessionCode } from "@/lib/ksp/session-code";
import type { InteractiveTask } from "@/lib/ksp/tasks";
import type { KspContent } from "@/lib/types/ksp";
import type { SessionTaskSnapshot } from "@/lib/types/session";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return { supabase, user };
}

function collectTasksFromPlan(content: KspContent): SessionTaskSnapshot[] {
  const out: SessionTaskSnapshot[] = [];
  let idx = 0;
  const stages: Array<{ label: string; tasks?: InteractiveTask[] }> = [
    { label: "Начало урока", tasks: content.stages?.beginning?.tasks },
    { label: "Середина урока", tasks: content.stages?.middle?.tasks },
    { label: "Конец урока", tasks: content.stages?.end?.tasks },
  ];
  for (const stage of stages) {
    for (const t of stage.tasks ?? []) {
      out.push({ index: idx, stageLabel: stage.label, task: t });
      idx += 1;
    }
  }
  return out;
}

export async function startSessionAction(
  planId: string,
): Promise<{ id?: string; code?: string; error?: string }> {
  try {
    const { supabase, user } = await requireUser();

    const { data: plan, error: planErr } = await supabase
      .from("lesson_plans")
      .select("id, owner_id, content")
      .eq("id", planId)
      .maybeSingle();
    if (planErr || !plan) return { error: "Plan not found" };
    if (plan.owner_id !== user.id) return { error: "Forbidden" };

    const tasks = collectTasksFromPlan(plan.content as KspContent);
    if (tasks.length === 0) {
      return {
        error:
          "В плане нет интерактивных заданий — добавьте хотя бы одно (раздел «Интерактивы»).",
      };
    }

    // Generate codes until we find one not in use among active sessions.
    // The unique partial index on (code) where status='active' enforces the
    // invariant; we just retry on collisions (which are extremely rare).
    let code = "";
    let inserted: { id: string; code: string } | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      code = generateSessionCode();
      const { data, error } = await supabase
        .from("lesson_sessions")
        .insert({
          plan_id: planId,
          owner_id: user.id,
          code,
          status: "active",
          tasks_snapshot: tasks,
        })
        .select("id, code")
        .single();
      if (!error && data) {
        inserted = data as { id: string; code: string };
        break;
      }
      // 23505 = unique violation — retry; everything else — bail out.
      if (
        error &&
        !(error as { code?: string }).code?.toString().includes("23505")
      ) {
        return { error: error.message };
      }
    }
    if (!inserted) return { error: "Не удалось сгенерировать код, попробуйте ещё раз" };

    revalidatePath(`/plans/${planId}`);
    return { id: inserted.id, code: inserted.code };
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return { error: "UNAUTHENTICATED" };
    }
    return {
      error: e instanceof Error ? e.message : "Не удалось создать сессию",
    };
  }
}

export async function closeSessionAction(
  sessionId: string,
): Promise<{ ok?: true; error?: string }> {
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase
      .from("lesson_sessions")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("id", sessionId)
      .eq("owner_id", user.id);
    if (error) return { error: error.message };
    revalidatePath(`/sessions/${sessionId}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ошибка" };
  }
}
