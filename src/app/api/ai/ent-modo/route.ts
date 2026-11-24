import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth, parseJsonBody } from "@/lib/api-handler";
import { COL, getDb } from "@/lib/mongo";
import { reserveQuotaOrResponse } from "@/lib/billing/quota";
import { generateEntModoWork } from "@/lib/ai/ent-modo-generator";
import { examKindSchema, type EntModoWork } from "@/lib/ai/ent-modo-models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface SavedEntModoDoc {
  owner_id: string;
  work: EntModoWork;
  online?: {
    assignmentId: string;
    code: string;
    issuedAt: string;
  };
  created_at: Date;
}

const createSchema = z.object({
  examKind: examKindSchema,
  subject: z.string().trim().min(2).max(140),
  grade: z.coerce.number().int().min(4).max(11),
  language: z.enum(["ru", "kz"]).default("ru"),
  partACount: z.coerce.number().int().min(3).max(20).default(8),
  contextCount: z.coerce.number().int().min(2).max(6).default(4),
  partCCount: z.coerce.number().int().min(0).max(8).default(3),
  topicFocus: z.string().trim().max(300).optional().default(""),
  learningObjectives: z.array(z.string().trim().min(2).max(500)).max(12).optional().default([]),
});

export const GET = withApiAuth(
  {
    rateLimit: { prefix: "ent-modo:list", limit: 60, windowMs: 60_000 },
    errorMessage: "Не удалось загрузить варианты ЕНТ/МОДО",
  },
  async ({ user }) => {
    const db = await getDb();
    const docs = await db
      .collection<SavedEntModoDoc>(COL.entModoWorks)
      .find({ owner_id: user.id })
      .sort({ created_at: -1 })
      .limit(12)
      .toArray();
    return NextResponse.json(
      {
        works: docs.map((d) => ({
          id: String((d as { _id?: unknown })._id ?? ""),
          createdAt: d.created_at.toISOString(),
          work: d.work,
          online: d.online ?? null,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
);

export const POST = withApiAuth(
  {
    rateLimit: { prefix: "ent-modo:gen", limit: 15, windowMs: 60_000 },
    errorMessage: "Не удалось сгенерировать вариант ЕНТ/МОДО",
  },
  async ({ req, user }) => {
    const parsed = await parseJsonBody(req, createSchema);
    if (parsed.error) return parsed.error;

    const quota = await reserveQuotaOrResponse(user, "assist");
    if (!quota.ok) return quota.response;

    try {
      const work = await generateEntModoWork(parsed.data);
      await quota.reservation.finalize(true);

      const db = await getDb();
      const inserted = await db.collection<SavedEntModoDoc>(COL.entModoWorks).insertOne({
        owner_id: user.id,
        work,
        created_at: new Date(),
      });

      return NextResponse.json({
        ok: true,
        id: inserted.insertedId.toHexString(),
        work,
      });
    } catch (error) {
      await quota.reservation.finalize(false).catch(() => {});
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "ИИ не смог сформировать вариант ЕНТ/МОДО. Попробуйте ещё раз.",
        },
        { status: 502 },
      );
    }
  },
);
