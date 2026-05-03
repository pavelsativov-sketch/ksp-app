"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { KspContent } from "@/lib/types/ksp";

export interface PlanVersionRow {
  id: string;
  plan_id: string;
  owner_id: string;
  title: string;
  content: KspContent;
  created_at: string;
  label: string | null;
}

/**
 * List all snapshots for a plan, newest first. Server-side authorisation:
 * RLS only returns rows where owner_id = auth.uid(), so a non-owner gets [].
 */
export async function listPlanVersionsAction(
  planId: string,
): Promise<PlanVersionRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("lesson_plan_versions")
    .select("id, plan_id, owner_id, title, content, created_at, label")
    .eq("plan_id", planId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return [];
  return (data ?? []) as PlanVersionRow[];
}

/**
 * Restore a specific version: copy its `content` and `title` back onto the
 * lesson_plans row. The trigger on lesson_plans automatically snapshots the
 * current state into lesson_plan_versions before overwriting, so the restore
 * itself becomes a new entry in the timeline (no version is lost).
 */
export async function restorePlanVersionAction(input: {
  versionId: string;
  planId: string;
}): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "UNAUTHENTICATED" };

  const { data: version, error: vErr } = await supabase
    .from("lesson_plan_versions")
    .select("title, content, owner_id, plan_id")
    .eq("id", input.versionId)
    .maybeSingle();
  if (vErr || !version) return { error: "Версия не найдена" };

  const v = version as { title: string; content: KspContent; owner_id: string; plan_id: string };
  if (v.owner_id !== user.id || v.plan_id !== input.planId) {
    return { error: "Нет доступа" };
  }

  const { error: upErr } = await supabase
    .from("lesson_plans")
    .update({ title: v.title, content: v.content })
    .eq("id", input.planId)
    .eq("owner_id", user.id);
  if (upErr) return { error: upErr.message };

  revalidatePath(`/plans/${input.planId}`);
  revalidatePath(`/plans/${input.planId}/edit`);
  return { ok: true };
}
