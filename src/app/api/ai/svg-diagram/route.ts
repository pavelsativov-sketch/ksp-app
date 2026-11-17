import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth, parseJsonBody } from "@/lib/api-handler";
import {
  autoDetectDiagramSpec,
  buildEducationalSvg,
  svgDiagramSpecSchema,
  svgToBase64,
  svgToDataUri,
} from "@/lib/ai/svg-diagram";

export const runtime = "nodejs";

const requestSchema = z.union([
  z.object({
    spec: svgDiagramSpecSchema,
  }),
  z.object({
    prompt: z.string().trim().min(1).max(600),
    topic: z.string().trim().max(200).optional(),
    subject: z.string().trim().max(120).optional(),
  }),
]);

export const POST = withApiAuth(
  {
    rateLimit: { prefix: "ai:svg-diagram", limit: 60, windowMs: 60_000 },
    requireMongo: true,
    errorMessage: "Не удалось построить учебную схему",
  },
  async ({ req }) => {
    const parsed = await parseJsonBody(req, requestSchema);
    if (parsed.error) return parsed.error;

    const spec =
      "spec" in parsed.data
        ? parsed.data.spec
        : autoDetectDiagramSpec(parsed.data);

    const svg = buildEducationalSvg(spec);
    return NextResponse.json(
      {
        spec,
        svg,
        base64: svgToBase64(svg),
        mimeType: "image/svg+xml",
        dataUri: svgToDataUri(svg),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
);
