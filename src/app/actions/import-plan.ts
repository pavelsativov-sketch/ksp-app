"use server";

import { createClient } from "@/lib/supabase/server";
import { emptyKsp, type KspContent } from "@/lib/types/ksp";
import type { AiKspPayload } from "@/lib/ai/prompt";
import { getMyProfile } from "@/app/actions/profile";

interface ImportSaveInput {
  title: string;
  subject_id: string | null;
  grade: number;
  quarter: number | null;
  section: string | null;
  language: "ru" | "kz";
  payload: AiKspPayload;
}

/**
 * Save a freshly-imported plan as a draft and return its id, so the client
 * can redirect to /plans/[id]/edit for review.
 *
 * The plan is private by default — the user can change visibility on the
 * edit page.
 */
export async function saveImportedPlanAction(
  input: ImportSaveInput,
): Promise<{ id?: string; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "UNAUTHENTICATED" };

    const profile = await getMyProfile();

    // Compose the full KspContent from the AI payload + lesson header from
    // the teacher's saved profile (if any). We never overwrite — only fill
    // gaps the AI didn't supply.
    const base = emptyKsp();
    const content: KspContent = {
      ...base,
      ...input.payload,
      header: {
        ...base.header,
        teacherName: profile?.full_name ?? base.header.teacherName,
        school: profile?.school ?? base.header.school,
        grade: String(input.grade),
      },
      // AI payload covers everything except header + learningObjectives.
      // We keep learningObjectives empty by default — the user attaches them
      // from the catalog on the edit page.
      learningObjectives: [],
    };

    const { data, error } = await supabase
      .from("lesson_plans")
      .insert({
        owner_id: user.id,
        title: input.title.trim() || input.payload.topic || "Импортированный план",
        subject_id: input.subject_id,
        grade: input.grade,
        quarter: input.quarter,
        section: input.section,
        visibility: "private",
        language: input.language,
        content,
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    return { id: (data as { id: string }).id };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Не удалось сохранить план",
    };
  }
}
