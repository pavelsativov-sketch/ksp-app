import { NextResponse } from "next/server";

/** This endpoint used to insert fabricated school records; demo seeding is retired. */
export async function POST() {
  return NextResponse.json(
    { error: "Демонстрационное наполнение отключено. Добавляйте реальные данные в разделах школы." },
    { status: 410 },
  );
}
