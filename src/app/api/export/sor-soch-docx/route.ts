import { NextResponse } from "next/server";
import { withApiAuth, parseJsonBody } from "@/lib/api-handler";
import { buildSorSochDocx, sorSochWorkSchema } from "@/lib/ai/sor-soch-generator";

export const runtime = "nodejs";

export const POST = withApiAuth(
  {
    rateLimit: { prefix: "sor-soch:docx", limit: 30, windowMs: 60_000 },
    errorMessage: "Не удалось собрать документ Word для СОР/СОЧ",
  },
  async ({ req }) => {
    const parsed = await parseJsonBody(req, sorSochWorkSchema);
    if (parsed.error) return parsed.error;

    const buf = await buildSorSochDocx(parsed.data);
    const fname = `${parsed.data.workType} - ${parsed.data.subject} - ${parsed.data.grade}`
      .replace(/[^\p{L}\p{N}_\- ]/gu, "_")
      .slice(0, 75);

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${fname}.docx`)}`,
        "Cache-Control": "no-store",
      },
    });
  },
);
