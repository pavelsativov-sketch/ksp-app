import { NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { buildAssessmentDocx } from "@/lib/export/assessment-docx";
import type { AssessmentPaperRow } from "@/lib/types/assessment";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assessment_papers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const paper = data as AssessmentPaperRow;

  if (paper.visibility === "private") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.id !== paper.owner_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const buffer = await buildAssessmentDocx(paper);
  const filename =
    `${paper.kind === "sor" ? "СОР" : "СОЧ"} ${paper.title || "assessment"}.docx`.replace(
      /[^\p{L}\p{N}_\-. ]/gu,
      "_",
    );

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
