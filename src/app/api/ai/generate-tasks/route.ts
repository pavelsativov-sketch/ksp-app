import { NextResponse } from "next/server";
import { z } from "zod";
import { generateTasks } from "@/lib/ai/tasks";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

const bodySchema = z.object({
  topic: z.string().trim().min(1),
  grade: z.coerce.number().int().min(1).max(12),
  subject: z.string().trim().min(1),
  stage: z.enum(["beginning", "middle", "end"]),
  language: z.enum(["ru", "kz"]).default("ru"),
  count: z.coerce.number().int().min(1).max(8).default(3),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
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
    const tasks = await generateTasks(parsed.data);
    return NextResponse.json({ tasks });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
