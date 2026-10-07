import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { requireSchoolAccess } from '@/lib/school';
import { getAttendancePerClass, getCurriculumProgress, getQualityMetrics, getSchoolOverview, getVskSummary } from '@/lib/school-analytics';

function csvCell(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);
  const text = /^[\s\uFEFF]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${text.replace(/"/g, '""')}"`;
}

function csv(rows: Array<Array<string | number | null | undefined>>): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireApiAuth();
    if (authResult.response) return authResult.response;
    const user = authResult.user;
    const { id } = await ctx.params;
    
    await requireSchoolAccess(user.id, id);
    const [overview, attendance, quality, curriculum, vsk] = await Promise.all([
      getSchoolOverview(id),
      getAttendancePerClass(id),
      getQualityMetrics(id),
      getCurriculumProgress(id),
      getVskSummary(id),
    ]);
    const report = { generatedAt: new Date().toISOString(), overview, attendance, quality, curriculum, vsk };
    const url = new URL(req.url);
    if (url.searchParams.get("format") === "csv") {
      const rows: Array<Array<string | number | null | undefined>> = [
        ["Раздел", "Показатель", "Значение", "Примечание"],
        ["Сводка", "Учащиеся", overview.students, ""],
        ["Сводка", "Педагоги", overview.teachers, ""],
        ["Сводка", "Классы", overview.classes, ""],
        ["Сводка", "Посещаемость", overview.attendanceRate === null ? "" : `${Math.round(overview.attendanceRate * 100)}%`, ""],
        ["Сводка", "Качество знаний", overview.qualityScore === null ? "" : `${Math.round(overview.qualityScore * 100)}%`, ""],
        ["Сводка", "Выполнение КТП", overview.curriculumProgress === null ? "" : `${Math.round(overview.curriculumProgress * 100)}%`, ""],
        ["Посещаемость", "Класс", "Процент", "Количество отметок"],
        ...attendance.map((item) => ["Посещаемость", item.className, `${Math.round(item.rate * 100)}%`, item.total]),
        ["Успеваемость", "Предмет", "Средний процент", ""],
        ...quality.map((item) => ["Успеваемость", item._id || "Без предмета", `${Math.round(item.average_score * 100)}%`, ""]),
        ["КТП", "Предмет · класс", "Пройдено уроков", "Всего уроков"],
        ...curriculum.map((item) => ["КТП", `${item.subject} · ${item.class_name}`, item.lessons.filter((lesson) => lesson.status === "completed").length, item.lessons.length]),
        ["ВШК", "Проверка", "Балл", "Статус"],
        ...vsk.map((item) => ["ВШК", `${item.direction} · ${item.teacher_name || "Педагог"}`, item.status === "completed" ? item.overall_score : "", item.status]),
      ];
      return new Response(csv(rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="school-report-${id}.csv"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    return NextResponse.json({ report }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка";
    const status = message.includes("Access denied") ? 403 : message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
