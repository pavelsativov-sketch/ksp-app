import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { listNotifications, markNotificationsRead } from "@/lib/notifications";

const markReadSchema = z.object({
  all: z.boolean().optional(),
  ids: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1).max(100).optional(),
}).refine((value) => Boolean(value.all) !== Boolean(value.ids), {
  message: "Choose all notifications or a list of notification ids",
});

const NO_STORE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  try {
    const result = await listNotifications(auth.user.id);
    return NextResponse.json(result, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Could not load notifications" }, { status: 500, headers: NO_STORE });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400, headers: NO_STORE });
  }
  const parsed = markReadSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid notification selection" }, { status: 400, headers: NO_STORE });
  try {
    await markNotificationsRead(auth.user.id, parsed.data.all ? undefined : [...new Set(parsed.data.ids)]);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Could not update notifications" }, { status: 500, headers: NO_STORE });
  }
}
