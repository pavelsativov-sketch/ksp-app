import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

const querySchema = z.object({
  subjectId: z.string().uuid().optional(),
  subject: z.string().trim().min(1).optional(),
  grade: z.coerce.number().int().min(1).max(12).optional(),
  search: z.string().trim().optional(),
});

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ objectives: [] });
  }
  const supabase = await createClient();
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const { subjectId, subject, grade, search } = parsed.data;

  let resolvedSubjectId = subjectId ?? null;
  if (!resolvedSubjectId && subject) {
    const { data: s } = await supabase
      .from("subjects")
      .select("id")
      .eq("name_ru", subject)
      .limit(1)
      .maybeSingle();
    resolvedSubjectId = s?.id ?? null;
  }
  if (!resolvedSubjectId) {
    return NextResponse.json({ objectives: [] });
  }

  let query = supabase
    .from("learning_objectives")
    .select("id, code, text_ru, text_kz, grade, section")
    .eq("subject_id", resolvedSubjectId)
    .order("code", { ascending: true })
    .limit(500);
  if (grade !== undefined) query = query.eq("grade", grade);
  if (search) query = query.ilike("text_ru", `%${search}%`);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ objectives: data ?? [] });
}
