import { NextResponse } from "next/server";
import JSZip from "jszip";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { buildKspDocx } from "@/lib/export/docx";
import { buildInteractiveHtml, buildReadme } from "@/lib/export/html";
import type { LessonPlanRow } from "@/lib/types/ksp";

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
    .from("lesson_plans")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const plan = data as LessonPlanRow;

  if (plan.visibility !== "public") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.id !== plan.owner_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let seriesOption: { title: string; total?: number } | null = null;
  if (plan.series_id) {
    const [{ data: srow }, { count }] = await Promise.all([
      supabase
        .from("lesson_series")
        .select("title")
        .eq("id", plan.series_id)
        .maybeSingle(),
      supabase
        .from("lesson_plans")
        .select("id", { count: "exact", head: true })
        .eq("series_id", plan.series_id),
    ]);
    if (srow?.title) {
      seriesOption = {
        title: (srow as { title: string }).title,
        total: count ?? undefined,
      };
    }
  }

  const zip = new JSZip();

  // plan.docx
  const docxBuffer = await buildKspDocx(plan, { series: seriesOption });
  zip.file("plan.docx", new Uint8Array(docxBuffer));

  // interactive.html (self-contained, works via file://)
  zip.file("interactive.html", buildInteractiveHtml(plan));

  // README.txt
  zip.file("README.txt", buildReadme(plan));

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const filename = `${plan.title || "ksp"}.zip`.replace(/[^\p{L}\p{N}_\-. ]/gu, "_");

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
