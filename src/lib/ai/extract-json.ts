/**
 * Устойчивое извлечение JSON из ответа модели.
 *
 * Прямой `JSON.parse(content)` падал двумя способами:
 *  1) модель оборачивала JSON в ```json … ``` — в логах это выглядело как
 *     «Unexpected token '`'»;
 *  2) ответ обрывался на середине (finish_reason=length у Groq/безлимитов) —
 *     тогда JSON.parse бросал «Unexpected end of JSON input», и весь каскад
 *     фоллбэка завершался 500 без объяснения учителю.
 *
 * Здесь: снимаем markdown-обёртку, срезаем хвост незакрытых объектов и
 * при неудаче сообщаем, чего именно не хватило.
 */
export function extractJson<T = unknown>(raw: string): T {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("AI вернул пустой ответ");
  }

  const candidates: string[] = [];
  const fenced = trimmed.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  candidates.push(trimmed);

  // Первый `{` или `[` — начало полезной нагрузки.
  const start = trimmed.search(/[[{]/);
  if (start > 0) candidates.push(trimmed.slice(start));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      const repaired = closeTruncatedJson(candidate);
      if (repaired) {
        try {
          return JSON.parse(repaired) as T;
        } catch {
          /* пробуем следующий кандидат */
        }
      }
    }
  }

  throw new Error(
    `AI вернул ответ, который не удалось разобрать как JSON (${trimmed.length} симв.): ${trimmed
      .slice(0, 160)
      .replace(/\s+/g, " ")}`,
  );
}

/**
 * Закрывает незавершённый JSON: доставляет недостающие `]`/`}` и убирает
 * хвост, начатый на неполном токене («"answer»: tru»).
 */
function closeTruncatedJson(input: string): string | null {
  const lastMeaningful = input.replace(/,\s*$/, "").trimEnd();
  if (!lastMeaningful) return null;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (const char of lastMeaningful) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      if (inString) escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{" || char === "[") stack.push(char);
    else if (char === "}" || char === "]") stack.pop();
  }

  if (stack.length === 0 && !inString) return null;

  // Строка осталась незакрытой — обрываем её и закрываем контейнеры.
  let repaired = lastMeaningful;
  if (inString) repaired += '"';
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    repaired += stack[i] === "{" ? "}" : "]";
  }
  return repaired;
}