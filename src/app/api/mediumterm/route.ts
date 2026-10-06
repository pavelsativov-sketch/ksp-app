import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/api-auth";
import {
  createMediumTermPlan,
  getMediumTermPlan,
  updateMediumTermPlan,
  deleteMediumTermPlan,
  getMediumTermPlans,
  linkKspToMediumTerm,
  unlinkKspFromMediumTerm,
  type MediumTermTopic,
} from "@/lib/longterm";

export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store" };
const errorResponse = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

// ─── Validation schemas ──────────────────────────────────────────────────────

const topicSchema = z.object({
  title: z.string().trim().min(1).max(300),
  hours: z.coerce.number().int().min(0).max(999),
  kspIds: z.array(z.string().regex(/^[0-9a-f]{24}$/i)).max(100).optional().default([]),
});

const createSchema = z.object({
  longTermId: z.string().regex(/^[0-9a-f]{24}$/i),
  quarter: z.coerce.number().int().min(1).max(4),
  title: z.string().trim().min(1).max(300),
  topics: z.array(topicSchema).min(0).max(100).optional().default([]),
});

const updateSchema = z.object({
  quarter: z.coerce.number().int().min(1).max(4).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  topics: z.array(topicSchema).min(0).max(100).optional(),
});

// ─── GET /api/mediumterm — list ССП for current user ────────────────────────

export async function GET(request: Request) {
  try {
    const auth = await requireApiAuth();
    if (auth.response) {
      auth.response.headers.set("Cache-Control", "no-store");
      return auth.response;
    }
    const { searchParams } = new URL(request.url);
    const longTermId = searchParams.get("longTermId") || undefined;
    const quarterParam = searchParams.get("quarter");
    const quarter = quarterParam ? Number(quarterParam) : undefined;
    const plans = await getMediumTermPlans(auth.user.id, { longTermId, quarter });
    return NextResponse.json({ plans }, { headers });
  } catch {
    return errorResponse("Не удалось загрузить планы. Попробуйте ещё раз.", 500);
  }
}

// ─── POST /api/mediumterm — create new ССП ──────────────────────────────────

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

    const plan = await createMediumTermPlan(auth.user.id, parsed.data);
    return NextResponse.json({ plan }, { status: 201, headers });
  } catch {
    return errorResponse("Не удалось создать план. Попробуйте ещё раз.", 500);
  }
}

// ─── PUT /api/mediumterm — update ССП ───────────────────────────────────────

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
    const existing = await getMediumTermPlan(id);
    if (!existing || existing.owner_id !== auth.user.id) {
      return errorResponse("Not found", 404);
    }

    const plan = await updateMediumTermPlan(id, data);
    return NextResponse.json({ plan }, { headers });
  } catch {
    return errorResponse("Не удалось обновить план. Попробуйте ещё раз.", 500);
  }
}

// ─── DELETE /api/mediumterm — delete ССП ────────────────────────────────────

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

    const existing = await getMediumTermPlan(id);
    if (!existing || existing.owner_id !== auth.user.id) {
      return errorResponse("Not found", 404);
    }

    await deleteMediumTermPlan(id);
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return errorResponse("Не удалось удалить план. Попробуйте ещё раз.", 500);
  }
}

// ─── POST /api/mediumterm/link — link КСП to ССП ───────────────────────────

export async function PATCH(request: Request) {
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

    const linkSchema = z.object({
      mediumTermId: z.string().regex(/^[0-9a-f]{24}$/i),
      kspId: z.string().regex(/^[0-9a-f]{24}$/i),
      action: z.enum(["link", "unlink"]),
    });
    const parsed = linkSchema.safeParse(json);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues.map((i) => i.message).join(", "),
        400,
      );
    }

    const { mediumTermId, kspId, action } = parsed.data;
    const existing = await getMediumTermPlan(mediumTermId);
    if (!existing || existing.owner_id !== auth.user.id) {
      return errorResponse("Not found", 404);
    }

    const plan = action === "link"
      ? await linkKspToMediumTerm(mediumTermId, kspId)
      : await unlinkKspFromMediumTerm(mediumTermId, kspId);
    return NextResponse.json({ plan }, { headers });
  } catch {
    return errorResponse("Не удалось выполнить действие. Попробуйте ещё раз.", 500);
  }
}
