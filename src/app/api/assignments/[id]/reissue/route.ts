import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { createEditedReissue } from "@/lib/assignments";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const rate = await checkRateLimitAsync(`assign:reissue:${auth.user.id}`, 10, 3600_000);
  if (!rate.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const { id } = await params;
    const result = await createEditedReissue(auth.user.id, id, input);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Исходная выдача изменилась")) {
      return NextResponse.json({ error: "source_changed" }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "reissue_unavailable" }, { status: 400 });
  }
}
