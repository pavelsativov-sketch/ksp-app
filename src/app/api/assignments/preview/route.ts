import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { previewAssignmentTasks } from "@/lib/assignments";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const rate = await checkRateLimitAsync(`assign:preview:${auth.user.id}`, 60, 3600_000);
  if (!rate.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const preview = await previewAssignmentTasks(auth.user.id, input);
    return NextResponse.json(preview, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "preview_unavailable" }, { status: 400 });
  }
}
