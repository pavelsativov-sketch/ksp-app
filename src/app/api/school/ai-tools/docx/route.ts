import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth, parseJsonBody } from "@/lib/api-handler";
import { getActiveSchool } from "@/lib/school/active";
import { buildOfficialMarkdownDocx } from "@/lib/export/markdown-docx";

export const runtime = "nodejs";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(240).optional(),
  content: z.string().trim().min(5).max(80_000),
  language: z.enum(["ru", "kz"]).optional().default("ru"),
});

export const POST = withApiAuth(
  {
    rateLimit: { prefix: "school:docx", limit: 40, windowMs: 60_000 },
    errorMessage: "Не удалось сформировать файл Word",
  },
  async ({ req, user }) => {
    const parsed = await parseJsonBody(req, bodySchema);
    if (parsed.error) return parsed.error;

    const school = await getActiveSchool(user.id).catch(() => null);
    const buf = await buildOfficialMarkdownDocx({
      title: parsed.data.title,
      subtitle: parsed.data.subtitle,
      content: parsed.data.content,
      schoolName: school?.name ?? null,
      teacherName: user.fullName ?? null,
      language: parsed.data.language,
    });

    const fname = `${parsed.data.title}`
      .replace(/[^\p{L}\p{N}_\- ]/gu, "_")
      .trim()
      .slice(0, 70) || "document";

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${fname}.docx`)}`,
        "Cache-Control": "no-store",
      },
    });
  },
);
