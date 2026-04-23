import { NextResponse } from "next/server";
import { z } from "zod";
import { generateKsp } from "@/lib/ai/generate";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

const bodySchema = z.object({
  grade: z.coerce.number().int().min(1).max(12),
  subject: z.string().trim().min(1),
  topic: z.string().trim().min(1),
  learningObjectives: z.array(z.string()).optional(),
  language: z.enum(["ru", "kz"]).default("ru"),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  // Require a logged-in user to avoid anonymous AI spend.
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  try {
    const content = await generateKsp(parsed.data);
    return NextResponse.json({ content });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
