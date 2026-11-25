import { NextResponse } from "next/server";
import { DocxLimitError, parseDocxWithMeta } from "@/lib/import/docx";
import { inferSubjectByObjectives } from "@/lib/goso/local";
import { listSubjects } from "@/lib/plans-repo";
import { requireApiAuth } from "@/lib/api-auth";
import { checkRateLimitAsync, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10 МБ

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth.response) return auth.response;

  const rl = await checkRateLimitAsync(`import:${clientIp(request)}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Превышен лимит импорта. Попробуйте позже." },
      { status: 429 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Некорректный запрос: ожидается multipart/form-data с файлом." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не получен" }, { status: 400 });
  }

  const name = file.name.toLowerCase();
  const isDocx =
    name.endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.type === "application/octet-stream";
  if (!isDocx) {
    return NextResponse.json(
      { error: "Поддерживаются только файлы .docx" },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Файл больше ${MAX_BYTES / 1024 / 1024} МБ` },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "Файл пуст" }, { status: 400 });
  }

  try {
    const { content, detected } = await parseDocxWithMeta(file);

    // Проверка «похоже ли это на КСП».
    //
    // Раньше роут возвращал 200 с контентом, даже если шаблон не распознался:
    // учитель получал пустой план без единого сообщения и думал, что импорт
    // сломался. Теперь такой случай — понятный 422 с объяснением.
    const header = content.header ?? ({} as Record<string, unknown>);
    const hasHeaderData =
      Boolean(content.topic?.trim()) ||
      Object.values(header).some(
        (value) => typeof value === "string" && value.trim() !== "",
      );
    const stages: unknown = content.stages ?? {};
    const stageValues = (Array.isArray(stages) ? stages : Object.values(stages ?? {})) as Array<
      Record<string, unknown>
    >;
    const hasStageData = stageValues.some((stage) =>
      Object.values(stage ?? {}).some((value) => {
        if (typeof value === "string") return value.trim() !== "";
        if (Array.isArray(value)) return value.length > 0;
        return false;
      }),
    );

    if (!hasHeaderData && !hasStageData) {
      return NextResponse.json(
        {
          error:
            "В документе не найдено ни одного поля КСП. Похоже, это не план урока " +
            "либо таблица «Ход урока» и шапка оформлены не как в шаблоне. " +
            "Проверьте, что есть таблица с этапами урока и строки «Предмет», «Тема», «Цели».",
          recognised: false,
        },
        { status: 422 },
      );
    }

    const inferredSubjectName =
      detected.subjectName ??
      inferSubjectByObjectives(
        content.learningObjectives,
        detected.grade,
        `${content.topic} ${content.header.longTermPlanSection ?? ""}`,
      );

    const subjects = await listSubjects().catch(() => []);
    const matchedSubject = inferredSubjectName
      ? subjects.find(
          (s) => s.name_ru.toLocaleLowerCase("ru-RU") === inferredSubjectName.toLocaleLowerCase("ru-RU"),
        ) ?? null
      : null;

    return NextResponse.json({
      content,
      detected: {
        ...detected,
        subjectName: inferredSubjectName,
        subjectId: matchedSubject?.id ?? null,
      },
      subjects,
    });
  } catch (error) {
    if (error instanceof DocxLimitError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Неизвестная ошибка";
    if (message.includes("Invalid DOCX") || message.includes("word/document.xml")) {
      return NextResponse.json(
        { error: "Не удалось прочитать документ. Убедитесь, что файл — корректный .docx с планом урока." },
        { status: 422 },
      );
    }
    console.error("DOCX import failed", error);
    return NextResponse.json(
      { error: "Ошибка при обработке документа. Попробуйте другой файл." },
      { status: 500 },
    );
  }
}
