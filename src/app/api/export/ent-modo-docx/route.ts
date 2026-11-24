import { NextResponse } from "next/server";
import { withApiAuth, parseJsonBody } from "@/lib/api-handler";
import { entModoWorkSchema } from "@/lib/ai/ent-modo-models";
import { buildEntModoDocx } from "@/lib/ai/ent-modo-generator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiAuth(
  {
    rateLimit: { prefix: "ent-modo:docx", limit: 30, windowMs: 60_000 },
    errorMessage: "Не удалось сформировать Word-документ ЕНТ/МОДО",
  },
  async ({ req }) => {
    const parsed = await parseJsonBody(req, entModoWorkSchema);
    if (parsed.error) return parsed.error;

    const buffer = await buildEntModoDocx(parsed.data);
    const filename = encodeURIComponent(
      `${parsed.data.examKind.toUpperCase()}-${parsed.data.subject}-${parsed.data.grade}.docx`,
    );

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="ent-modo.docx"; filename*=UTF-8''${filename}`,
        "Cache-Control": "no-store",
      },
    });
  },
);
