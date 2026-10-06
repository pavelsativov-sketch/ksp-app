import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import {
  createLongTermPlan,
  getLongTermPlan,
  updateLongTermPlan,
  deleteLongTermPlan,
  listLongTermPlans,
  type LongTermSection,
} from "@/lib/longterm";

export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store" };
const errorResponse = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

// ─── Validation schemas ──────────────────────────────────────────────────────

const topicSchema = z.object({
  title: z.string().trim().min(1).max(300),
  hours: z.coerce.number().int().min(0).max(999),
  objectives: z.string().trim().max(2000).optional().default(""),
});

const sectionSchema = z.object({
  title: z.string().trim().min(1).max(300),
  topics: z.array(topicSchema).min(0).max(100),
});

const createSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  grade: z.coerce.number().int().min(1).max(11),
  year: z.string().trim().min(1).max(20),
  sections: z.array(sectionSchema).min(0).max(50).optional().default([]),
});

const updateSchema = z.object({
  subject: z.string().trim().min(1).max(200).optional(),
  grade: z.coerce.number().int().min(1).max(11).optional(),
  year: z.string().trim().min(1).max(20).optional(),
  sections: z.array(sectionSchema).min(0).max(50).optional(),
});

// ─── GET /api/longterm — list all ДСП for current user ───────────────────────

export async function GET() {
  try {
    const auth = await requireApiAuth();
    if (auth.response) {
      auth.response.headers.set("Cache-Control", "no-store");
      return auth.response;
    }
    const plans = await listLongTermPlans(auth.user.id);
    return NextResponse.json({ plans }, { headers });
  } catch {
    return errorResponse("Не удалось загрузить планы. Попробуйте ещё раз.", 500);
  }
}

// ─── POST /api/longterm — create new ДСП ────────────────────────────────────

export async function POST(request: Request) {
  try {
    const auth = await requireApiAuth();
    if (auth.response) {
      auth.response.headers.set("Cache-Control", "no-store");
      return auth.response;
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return errorResponse("Invalid JSON", 400);
    }

    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues.map((i) => i.message).join(", "),
        400,
      );
    }

    const plan = await createLongTermPlan(auth.user.id, parsed.data);
    return NextResponse.json({ plan }, { status: 201, headers });
  } catch {
    return errorResponse("Не удалось создать план. Попробуйте ещё раз.", 500);
  }
}

// ─── PUT /api/longterm — update ДСП ─────────────────────────────────────────

export async function PUT(request: Request) {
  try {
    const auth = await requireApiAuth();
    if (auth.response) {
      auth.response.headers.set("Cache-Control", "no-store");
      return auth.response;
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return errorResponse("Invalid JSON", 400);
    }

    const bodySchema = z.object({ id: z.string().regex(/^[0-9a-f]{24}$/i) }).and(updateSchema);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues.map((i) => i.message).join(", "),
        400,
      );
    }

    const { id, ...data } = parsed.data;
    const existing = await getLongTermPlan(id);
    if (!existing || existing.owner_id !== auth.user.id) {
      return errorResponse("Not found", 404);
    }

    const plan = await updateLongTermPlan(id, data);
    return NextResponse.json({ plan }, { headers });
  } catch {
    return errorResponse("Не удалось обновить план. Попробуйте ещё раз.", 500);
  }
}

// ─── DELETE /api/longterm — delete ДСП ──────────────────────────────────────

export async function DELETE(request: Request) {
  try {
    const auth = await requireApiAuth();
    if (auth.response) {
      auth.response.headers.set("Cache-Control", "no-store");
      return auth.response;
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id || !/^[0-9a-f]{24}$/i.test(id)) {
      return errorResponse("Invalid id", 400);
    }

    const existing = await getLongTermPlan(id);
    if (!existing || existing.owner_id !== auth.user.id) {
      return errorResponse("Not found", 404);
    }

    await deleteLongTermPlan(id);
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return errorResponse("Не удалось удалить план. Попробуйте ещё раз.", 500);
  }
}
