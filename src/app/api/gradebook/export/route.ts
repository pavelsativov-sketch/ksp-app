import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isMongoConfigured } from "@/lib/mongo";
import { checkRateLimitAsync, clientIp } from "@/lib/rate-limit";
import { getTeacherGradebook, getStudentResults, exportGradebookToCsv, exportStudentToCsv } from "@/lib/gradebook";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isMongoConfigured()) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimitAsync(`gradebook-export:${user.id || clientIp(request)}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const url = new URL(request.url);
  const studentParam = url.searchParams.get("student");

  let csv: string;
  let filename: string;

  if (studentParam) {
    // searchParams уже декодирован — повторный decode ломался на «%» в имени.
    const studentName = studentParam;
    const student = await getStudentResults(user.id, studentName);
    if (!student) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    csv = exportStudentToCsv(student);
    filename = `gradebook-${student.studentName}.csv`;
  } else {
    const data = await getTeacherGradebook(user.id);
    csv = exportGradebookToCsv(data);
    filename = "gradebook.csv";
  }

  const csvWithBom = csv.startsWith("\uFEFF") ? csv : `\uFEFF${csv}`;
  return new NextResponse(new TextEncoder().encode(csvWithBom), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
