/**
 * Результаты работы агента, которые учитель должен видеть и скачивать:
 * созданные КСП и КТП с готовыми ссылками. Чистый модуль без БД и сети:
 * его используют и интерфейс, и тесты.
 */

export interface Deliverable {
  kind: "ksp" | "ktp";
  title: string;
  /** Страница плана в приложении. */
  url: string;
  docxUrl?: string;
  pptxUrl?: string;
  /** Файл с копией в рабочей области агента (текст). */
  workspaceFile?: string;
}

/** Ссылки на материалы плана: страница, Word и PowerPoint. */
export function planLinks(planId: string): { url: string; docxUrl: string; pptxUrl: string } {
  return {
    url: `/plans/${planId}`,
    docxUrl: `/api/export/docx/${planId}`,
    pptxUrl: `/api/export/pptx/${planId}`,
  };
}

/** Безопасное имя файла по теме: кириллица остаётся, остальное заменяется. */
export function slugForFile(text: string, fallback = "material"): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

interface EventLike {
  type?: string;
  data?: unknown;
}

/** Достаёт из журнала задачи созданные материалы (по результатам инструментов). */
export function extractDeliverables(events: EventLike[]): Deliverable[] {
  const out: Deliverable[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    if (event.type !== "TOOL_RESULT" || !event.data || typeof event.data !== "object") continue;
    const { tool, result } = event.data as { tool?: unknown; result?: unknown };
    if (tool !== "createKsp" && tool !== "createKtp") continue;
    let parsed: Record<string, unknown>;
    try {
      parsed = typeof result === "string" ? JSON.parse(result) : (result as Record<string, unknown>);
    } catch {
      continue;
    }
    if (!parsed || parsed.success !== true) continue;
    const url = typeof parsed.url === "string" ? parsed.url : "";
    if (!url.startsWith("/") || seen.has(`${tool}:${url}`)) continue;
    seen.add(`${tool}:${url}`);
    out.push({
      kind: tool === "createKsp" ? "ksp" : "ktp",
      title: typeof parsed.title === "string" ? parsed.title : tool === "createKsp" ? "КСП" : "КТП",
      url,
      docxUrl: typeof parsed.docxUrl === "string" && parsed.docxUrl.startsWith("/") ? parsed.docxUrl : undefined,
      pptxUrl: typeof parsed.pptxUrl === "string" && parsed.pptxUrl.startsWith("/") ? parsed.pptxUrl : undefined,
      workspaceFile: typeof parsed.file === "string" ? parsed.file : undefined,
    });
  }
  return out;
}

interface RichEventLike extends EventLike {
  message?: string;
}

/** Файлы, которые агент создал в рабочей области: writeFile и копии КСП/КТП. */
export function extractTaskFiles(events: RichEventLike[]): string[] {
  const files: string[] = [];
  const add = (name: unknown) => {
    if (typeof name === "string" && name.trim() && !files.includes(name.trim())) files.push(name.trim());
  };
  for (const event of events) {
    const data = event.data && typeof event.data === "object" ? (event.data as { tool?: unknown; args?: { filename?: unknown }; result?: unknown }) : null;
    if (!data) continue;
    if (event.type === "TOOL_CALL" && data.tool === "writeFile") add(data.args?.filename);
    if (event.type === "TOOL_RESULT" && (data.tool === "createKsp" || data.tool === "createKtp") && typeof data.result === "string") {
      try {
        const parsed = JSON.parse(data.result) as { success?: boolean; file?: unknown };
        if (parsed.success === true) add(parsed.file);
      } catch { /* битый результат пропускаем */ }
    }
  }
  return files;
}

/** Что агент делает сейчас: последнее действие инструмента или мысль. Пусто, если событий нет. */
export function currentActivity(events: RichEventLike[]): string {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]!;
    if ((event.type === "TOOL_CALL" || event.type === "REASONING") && event.message?.trim()) {
      // Разметку Markdown (**жирный**, # заголовки, `код`) убираем: в строке «Сейчас» она выглядит мусором.
      return event.message.replace(/[*_`#>]+/g, "").replace(/\s+/g, " ").trim().slice(0, 140);
    }
  }
  return "";
}

/** Итог работы: сообщение финального события END (кроме ручной остановки). */
export function finalSummary(events: RichEventLike[]): string {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]!;
    if (event.type === "END" && event.message?.trim() && event.message !== "Остановлено пользователем") {
      return event.message.trim();
    }
  }
  return "";
}

/** Текстовая копия КСП для рабочей области (читается в «Файлах» и редакторе). */
export function kspToMarkdown(input: {
  title: string;
  grade: number;
  language: string;
  content: {
    topic?: string;
    lessonObjectives?: string[];
    assessmentCriteria?: string[];
    stages?: Record<"beginning" | "middle" | "end", { time?: string; teacherActions?: string; studentActions?: string; resources?: string } | undefined>;
    evaluation?: { formativeAssessment?: string; differentiation?: string; reflection?: string };
  };
}): string {
  const c = input.content;
  const list = (items?: string[]) => (items?.length ? items.map((item) => `- ${item}`).join("\n") : "—");
  const stage = (name: string, key: "beginning" | "middle" | "end") => {
    const s = c.stages?.[key];
    if (!s) return `## ${name}\n—\n`;
    return [
      `## ${name}${s.time ? ` (${s.time})` : ""}`,
      `**Учитель:** ${s.teacherActions || "—"}`,
      `**Ученики:** ${s.studentActions || "—"}`,
      `**Ресурсы:** ${s.resources || "—"}`,
      "",
    ].join("\n");
  };
  return [
    `# ${input.title}`,
    `Класс: ${input.grade} · Язык: ${input.language === "kz" ? "казахский" : "русский"}`,
    "",
    `**Тема:** ${c.topic || "—"}`,
    "",
    "## Цели урока",
    list(c.lessonObjectives),
    "",
    "## Критерии оценивания",
    list(c.assessmentCriteria),
    "",
    stage("Начало урока", "beginning"),
    stage("Середина урока", "middle"),
    stage("Конец урока", "end"),
    "## Оценивание",
    c.evaluation?.formativeAssessment || "—",
    "",
  ].join("\n");
}

/** Таблица КТП в Markdown для рабочей области. */
export function ktpToMarkdown(ktp: {
  title: string;
  subject: string;
  grade: number;
  rows: Array<{ number: number; topic: string; hours: number; date: string; objectives: string }>;
}): string {
  const esc = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [
    `# Календарно-тематический план: ${ktp.title}`,
    `${ktp.subject} · ${ktp.grade} класс`,
    "",
    "| № | Тема | Часы | Дата | Цели |",
    "|---|------|------|------|------|",
    ...ktp.rows.map((r) => `| ${r.number} | ${esc(r.topic)} | ${r.hours} | ${r.date || "—"} | ${esc(r.objectives) || "—"} |`),
    "",
  ].join("\n");
}
