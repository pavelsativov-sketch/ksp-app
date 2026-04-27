"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createLessonPlanSchema } from "@/lib/validation/ksp";
import type { KspContent, LessonSeriesRow } from "@/lib/types/ksp";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }
  return { supabase, user };
}

export interface SavePlanInput {
  id?: string;
  title: string;
  subject_id: string | null;
  grade: number;
  quarter: number | null;
  section: string | null;
  visibility: "private" | "unlisted" | "public";
  language: "ru" | "kz";
  content: KspContent;
  series_id?: string | null;
  series_position?: number | null;
}

export async function savePlanAction(input: SavePlanInput) {
  const parsed = createLessonPlanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues.map((i) => i.message).join(", "),
    };
  }

  const { supabase, user } = await requireUser();
  const data = parsed.data;

  const seriesFields = {
    series_id: input.series_id ?? null,
    series_position:
      input.series_position == null || isNaN(input.series_position)
        ? null
        : input.series_position,
  };

  if (input.id) {
    const { error } = await supabase
      .from("lesson_plans")
      .update({
        title: data.title,
        subject_id: data.subject_id,
        grade: data.grade,
        quarter: data.quarter,
        section: data.section,
        visibility: data.visibility,
        language: data.language,
        content: data.content,
        ...seriesFields,
      })
      .eq("id", input.id)
      .eq("owner_id", user.id);
    if (error) return { error: error.message };
    revalidatePath(`/plans/${input.id}`);
    revalidatePath("/dashboard");
    return { id: input.id };
  }

  const { data: inserted, error } = await supabase
    .from("lesson_plans")
    .insert({
      owner_id: user.id,
      title: data.title,
      subject_id: data.subject_id,
      grade: data.grade,
      quarter: data.quarter,
      section: data.section,
      visibility: data.visibility,
      language: data.language,
      content: data.content,
      ...seriesFields,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { id: inserted.id };
}

// ─── Series ────────────────────────────────────────────────────────────────

export async function listMySeriesAction(): Promise<LessonSeriesRow[]> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("lesson_series")
    .select("id, user_id, title, subject, grade, quarter, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as LessonSeriesRow[];
}

export async function createSeriesAction(input: {
  title: string;
  subject?: string | null;
  grade?: number | null;
  quarter?: number | null;
}): Promise<{ id?: string; error?: string }> {
  if (!input.title?.trim()) return { error: "Заполните название серии" };
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("lesson_series")
    .insert({
      user_id: user.id,
      title: input.title.trim(),
      subject: input.subject ?? null,
      grade: input.grade ?? null,
      quarter: input.quarter ?? null,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { id: data.id };
}

export async function deletePlanAction(id: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("lesson_plans")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function duplicatePlanAction(id: string) {
  const { supabase, user } = await requireUser();
  const { data: src, error } = await supabase
    .from("lesson_plans")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!src) throw new Error("Не найден план");

  const { data: inserted, error: insErr } = await supabase
    .from("lesson_plans")
    .insert({
      owner_id: user.id,
      title: `${src.title} (копия)`,
      subject_id: src.subject_id,
      grade: src.grade,
      quarter: src.quarter,
      section: src.section,
      content: src.content,
      visibility: "private",
      language: src.language,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.message);
  revalidatePath("/dashboard");
  redirect(`/plans/${inserted.id}/edit`);
}
