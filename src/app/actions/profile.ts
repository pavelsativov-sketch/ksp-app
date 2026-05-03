"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ProfileRow {
  id: string;
  full_name: string | null;
  school: string | null;
  city: string | null;
  default_grade: number | null;
  preferred_locale: string | null;
}

export async function getMyProfile(): Promise<ProfileRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, school, city, default_grade, preferred_locale")
    .eq("id", user.id)
    .maybeSingle();
  return (data as ProfileRow | null) ?? null;
}

export interface UpdateProfileInput {
  full_name?: string | null;
  school?: string | null;
  city?: string | null;
  default_grade?: number | null;
  preferred_locale?: string | null;
}

export async function updateMyProfileAction(
  input: UpdateProfileInput,
): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "UNAUTHENTICATED" };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("full_name" in input) patch.full_name = input.full_name ?? null;
  if ("school" in input) patch.school = input.school ?? null;
  if ("city" in input) patch.city = input.city ?? null;
  if ("default_grade" in input) patch.default_grade = input.default_grade ?? null;
  if ("preferred_locale" in input) patch.preferred_locale = input.preferred_locale ?? null;

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, ...patch })
    .eq("id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Lightweight server action used by the locale switcher in the header.
 * Persists the preferred UI language so it follows the user across devices
 * (the client-side `localStorage` value is just a cache for fast first paint).
 */
export async function setMyLocaleAction(
  locale: "ru" | "kz",
): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "UNAUTHENTICATED" };

  const { error } = await supabase
    .from("profiles")
    .upsert({
      id: user.id,
      preferred_locale: locale,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message };
  return { ok: true };
}
