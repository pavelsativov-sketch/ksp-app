/**
 * Частичный отчёт для задачи, которая не дошла до конца (лимит шагов, время,
 * сбой браузера): учитель всегда получает результат, а не одну строку ошибки.
 * Собирается из транскрипта без обращения к модели: провайдер как раз мог упасть.
 */

interface TranscriptMessage {
  role: string;
  content?: unknown;
  tool_calls?: readonly unknown[];
}

interface BrowserResult {
  success?: boolean;
  url?: string;
  title?: string;
  content?: string;
  error?: string;
}

const MAX_SNIPPET = 400;

function parseResult(content: unknown): BrowserResult | null {
  if (typeof content !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed && typeof parsed === "object" ? (parsed as BrowserResult) : null;
  } catch {
    return null;
  }
}

function shorten(text: string, limit = MAX_SNIPPET): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
}

export function buildPartialReport(messages: readonly TranscriptMessage[], reason: string): string {
  const actions = messages.flatMap((m) => (m.role === "assistant" ? m.tool_calls ?? [] : []));
  const browserActions = actions.filter((c) => (c as { function?: { name?: string } }).function?.name?.startsWith("browser")).length;
  const results = messages
    .filter((m) => m.role === "tool")
    .map((m) => parseResult(m.content))
    .filter((r): r is BrowserResult => r !== null);

  const lastPage = [...results].reverse().find((r) => r.success !== false && r.url);
  const lastError = [...results].reverse().find((r) => r.success === false && r.error);
  const lastNote = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && typeof m.content === "string" && m.content.trim().length > 0);

  const lines = [`Задача выполнена не полностью: ${reason}`];
  lines.push(`Сделано шагов: ${actions.length}${browserActions ? `, из них действий в браузере: ${browserActions}` : ""}.`);
  if (lastPage?.url) lines.push(`Последняя страница: ${lastPage.title ? `${lastPage.title}, ` : ""}${lastPage.url}`);
  if (lastPage?.content) lines.push(`Что было на экране: ${shorten(lastPage.content)}`);
  if (typeof lastNote?.content === "string") lines.push(`Последняя заметка агента: ${shorten(lastNote.content)}`);
  if (lastError?.error) lines.push(`Последняя ошибка: ${shorten(lastError.error, 200)}`);
  lines.push("Что дальше: запустите задачу ещё раз покороче или по частям. Прогресс не потерян: агент продолжит с последней страницы.");
  return lines.join("\n");
}
