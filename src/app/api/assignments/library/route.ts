import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { teacherTaskLibrary } from "@/lib/assignments";

export const runtime = "nodejs";

/** Библиотека заданий учителя для повтора: свои выдачи и свои КСП. */
export async function GET() {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;
  try {
    const library = await teacherTaskLibrary(auth.user.id);
    return NextResponse.json(library, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Не удалось загрузить библиотеку." }, { status: 503 });
  }
}
