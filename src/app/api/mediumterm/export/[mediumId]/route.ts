import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMediumTermPlan, getLongTermPlan } from "@/lib/longterm";
import { buildMediumTermDocx } from "@/lib/export/mediumterm-docx";
import { toObjectId } from "@/lib/mongo";

export const runtime = "nodejs";

interface PageProps {
  params: Promise<{ mediumId: string }>;
}

export async function GET(_request: Request, { params }: PageProps) {
  const { mediumId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  if (!toObjectId(mediumId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const mediumPlan = await getMediumTermPlan(mediumId);
  if (!mediumPlan || mediumPlan.owner_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const longTermPlan = await getLongTermPlan(mediumPlan.longTermId);
  if (!longTermPlan || longTermPlan.owner_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buffer = await buildMediumTermDocx(mediumPlan, longTermPlan);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="medium-term-plan-${mediumId}.docx"`,
    },
  });
}
