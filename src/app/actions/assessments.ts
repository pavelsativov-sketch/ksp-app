"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createAssessmentSchema,
  type AssessmentContentParsed,
} from "@/lib/validation/assessment";
import { totalAssessmentPoints } from "@/lib/types/assessment";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return { supabase, user };
}

export interface SaveAssessmentInput {
  id?: string;
  kind: "sor" | "soch";
  title: string;
  subject_id: string | null;
  grade: number;
  quarter: number | null;
  section: string | null;
  duration_minutes: number | null;
  visibility: "private" | "unlisted" | "public";
  language: "ru" | "kz";
  content: AssessmentContentParsed;
}

export async function saveAssessmentAction(
  input: SaveAssessmentInput,
): Promise<{ id?: string; error?: string }> {
  const parsed = createAssessmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues.map((i) => i.message).join(", "),
    };
  }

  const { supabase, user } = await requireUser();
  const data = parsed.data;
  const totalPoints = totalAssessmentPoints(data.content);

  if (input.id) {
    const { error } = await supabase
      .from("assessment_papers")
      .update({
        kind: data.kind,
        title: data.title,
        subject_id: data.subject_id,
        grade: data.grade,
        quarter: data.quarter,
        section: data.section,
        duration_minutes: data.duration_minutes,
        total_points: totalPoints,
        visibility: data.visibility,
        language: data.language,
        content: data.content,
      })
      .eq("id", input.id)
      .eq("owner_id", user.id);
    if (error) return { error: error.message };
    revalidatePath(`/assessments/${input.id}`);
    revalidatePath("/dashboard");
    return { id: input.id };
  }

  const { data: inserted, error } = await supabase
    .from("assessment_papers")
    .insert({
      owner_id: user.id,
      kind: data.kind,
      title: data.title,
      subject_id: data.subject_id,
      grade: data.grade,
      quarter: data.quarter,
      section: data.section,
      duration_minutes: data.duration_minutes,
      total_points: totalPoints,
      visibility: data.visibility,
      language: data.language,
      content: data.content,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { id: inserted.id };
}

export async function deleteAssessmentAction(id: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("assessment_papers")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
