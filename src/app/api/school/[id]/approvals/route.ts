import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import { requireSchoolAccess } from "@/lib/school";
import { log } from "@/lib/logger";
import { hasSchoolPermission } from "@/lib/school/role-matrix";
import { PLAN_VERSION_SECTIONS } from "@/lib/plan-sections";
import {
  APPROVAL_VERSION_CHANGED,
  createApprovalCycle,
  getApprovalCycleForViewer,
  getApprovalCyclesForPlan,
  getSchoolApprovalQueue,
  transitionApprovalCycle,
} from "@/lib/school-approvals";

const idSchema = z.string().regex(/^[a-f\d]{24}$/i);
const bodySchema = z.object({
  action: z.enum(["submit", "resubmit", "review", "comment", "request_changes", "approve"]),
  plan_id: idSchema,
  cycle_id: idSchema.optional(),
  expected_updated_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/).optional(),
  class_name: z.string().trim().min(1).max(50).optional(),
  comment: z.string().max(2000).optional(),
  section: z.enum(PLAN_VERSION_SECTIONS).optional(),
}).strict();

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to process school review";
  const duplicate = typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 11000;
  const status = message.includes("Access denied") ? 403
    : message.toLowerCase().includes("not found") ? 404
    : duplicate || message === APPROVAL_VERSION_CHANGED || message.startsWith("План изменился") || message.includes("another session") || message.includes("already has an active") || message.includes("already been approved") || message.includes("current state") || message.includes("only be") ? 409
    : message.includes("too large") ? 413
    : ["Save the plan", "Only a returned", "Edit the plan", "Choose a plan section", "Add a comment", "Comment is too long", "Invalid plan section", "Invalid school class"].some((prefix) => message.startsWith(prefix)) ? 400
    : 500;
  if (status === 500) log.error("School approval request failed", { error: message });
  return NextResponse.json({ error: status === 403 ? "Access denied" : status === 404 ? "Not found" : status === 409 ? "Review version changed; refresh and review the saved version" : status === 413 ? "Plan snapshot is too large" : status === 400 ? message : "Unable to process school review" }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const { id: schoolId } = await ctx.params;
  const url = new URL(req.url);
  const planId = url.searchParams.get("plan_id");
  const cycleId = url.searchParams.get("cycle_id");

  try {
    if (!planId) {
      const queue = await getSchoolApprovalQueue(auth.user.id, schoolId);
      return NextResponse.json({ queue }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const cycles = cycleId
      ? [await getApprovalCycleForViewer(auth.user.id, schoolId, cycleId)]
      : await getApprovalCyclesForPlan(auth.user.id, schoolId, planId);
    let canReview = false;
    let canApprove = false;
    let canComment = false;
    try {
      const member = await requireSchoolAccess(auth.user.id, schoolId);
      canReview = hasSchoolPermission(member.role, member.granted_permissions, "school:plans:review");
      canApprove = member.role !== "admin" && hasSchoolPermission(member.role, member.granted_permissions, "school:plans:approve");
      canComment = canReview || hasSchoolPermission(member.role, member.granted_permissions, "school:plans:comment_assigned");
    } catch {
      // A removed school member may still read their own historical review thread.
    }
    return NextResponse.json({ cycles, canReview, canApprove, canComment: canComment && cycles.length > 0 }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  const { id: schoolId } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid review request" }, { status: 400, headers: { "Cache-Control": "no-store" } });

  try {
    const input = parsed.data;
    if (input.action === "submit" || input.action === "resubmit") {
      if (!input.expected_updated_at || !input.class_name) return NextResponse.json({ error: "Choose a school class and submit the current plan version" }, { status: 400, headers: { "Cache-Control": "no-store" } });
      const cycle = await createApprovalCycle(auth.user.id, schoolId, input.plan_id, input.class_name, input.expected_updated_at, input.action);
      return NextResponse.json({ cycle }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
    }
    if (!input.cycle_id) return NextResponse.json({ error: "A review cycle is required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    const existing = await getApprovalCycleForViewer(auth.user.id, schoolId, input.cycle_id);
    if (existing.plan_id !== input.plan_id) return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    const cycle = await transitionApprovalCycle(auth.user.id, schoolId, input.cycle_id, input.action, {
      ...(input.comment !== undefined ? { comment: input.comment } : {}),
      ...(input.section ? { section: input.section } : {}),
    });
    return NextResponse.json({ cycle }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return failure(error);
  }
}
