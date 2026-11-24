import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth, parseJsonBody } from "@/lib/api-handler";
import { COL, getDb } from "@/lib/mongo";
import { reserveQuotaOrResponse } from "@/lib/billing/quota";
import { generateSorSochWork, type SorSochWork } from "@/lib/ai/sor-soch-generator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface SavedSorDoc {
  owner_id: string;
  work: SorSochWork;
  online?: {
    v1Id: string;
    v1Code: string;
    v2Id: string;
    v2Code: string;
    issuedAt: string;
  };
  created_at: Date;
}

const createSchema = z.object({
  subject: z.string().trim().min(2).max(120),
  grade: z.coerce.number().int().min(1).max(11),
  quarter: z.coerce.number().int().min(1).max(4),
  workType: z.string().trim().min(2).max(40),
  language: z.enum(["ru", "kz"]).default("ru"),
  maxPoints: z.coerce.number().int().min(5).max(50).default(15),
  durationMinutes: z.coerce.number().int().min(15).max(90).default(25),
  sectionOrTopic: z.string().trim().max(300).optional().default(""),
  learningObjectives: z.array(z.string().trim().min(2).max(500)).max(10).optional().default([]),
  taskCount: z.coerce.number().int().min(3).max(8).optional().default(4),
});

export const GET = withApiAuth(
  {
    rateLimit: { prefix: "sor-soch:list", limit: 60, windowMs: 60_000 },
    errorMessage: "Не удалось загрузить сохранённые работы СОР/СОЧ",
  },
  async ({ user }) => {
    const db = await getDb();
    const docs = await db
      .collection<SavedSorDoc>(COL.sorSochWorks)
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
    rateLimit: { prefix: "sor-soch:gen", limit: 15, windowMs: 60_000 },
    errorMessage: "Не удалось сгенерировать комплект СОР/СОЧ",
  },
  async ({ req, user }) => {
    const parsed = await parseJsonBody(req, createSchema);
    if (parsed.error) return parsed.error;

    const quota = await reserveQuotaOrResponse(user, "assist");
    if (!quota.ok) return quota.response;

    try {
      const work = await generateSorSochWork(parsed.data);
      await quota.reservation.finalize(true);

      const db = await getDb();
      const inserted = await db.collection<SavedSorDoc>(COL.sorSochWorks).insertOne({
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
              : "ИИ не смог сформировать комплект СОР/СОЧ. Попробуйте ещё раз.",
        },
        { status: 502 },
      );
    }
  },
);
