import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import {
  assignSchoolClass,
  getSchoolClassAssignmentsForViewer,
  revokeSchoolClassAssignment,
} from "@/lib/school-permissions";

const assignSchema = z.object({
  teacherId: z.string().trim().min(1).max(128),
  className: z.string().trim().min(1).max(20),
});
const revokeSchema = z.object({ assignmentId: z.string().regex(/^[a-f\d]{24}$/i) });

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed";
  const status = message.startsWith("Access denied") ? 403
    : message.includes("not found") ? 404
    : message.startsWith("Invalid") || message.startsWith("Admin must") ? 400
    : 500;
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  try {
    const { id } = await ctx.params;
    const assignments = await getSchoolClassAssignmentsForViewer(auth.user.id, id);
    return NextResponse.json({ assignments }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  try {
    const { id } = await ctx.params;
    const parsed = assignSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid class assignment" }, { status: 400 });
    await assignSchoolClass(auth.user.id, id, parsed.data.teacherId, parsed.data.className);
    return NextResponse.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  try {
    const { id } = await ctx.params;
    const parsed = revokeSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid assignment id" }, { status: 400 });
    await revokeSchoolClassAssignment(auth.user.id, id, parsed.data.assignmentId);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
