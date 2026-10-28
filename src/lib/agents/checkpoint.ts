import type OpenAI from "openai";

/**
 * Контрольная точка агента.
 *
 * Цикл агента живёт внутри серверлесс-функции с потолком 300 с. Когда функция
 * погибает (или агент ждёт учителя на паузе), задача перезапускается. Раньше
 * перезапуск начинался с пустого транскрипта: агент заново открывал страницы и
 * мог повторить уже сделанные действия. Теперь транскрипт и счётчик шагов
 * сохраняются в документе задачи, а новый раннер продолжает с этого места.
 *
 * Модуль чистый (без БД и сети), чтобы его можно было проверять таблично.
 */
export type AgentMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export const CHECKPOINT_VERSION = 1;
/** Сколько последних сообщений держим в контрольной точке и в контексте модели. */
export const KEEP_TAIL_MESSAGES = 24;
/** Жёсткий предел размера сериализованной точки (документ Mongo ≤ 16 МБ). */
export const MAX_CHECKPOINT_CHARS = 300_000;
/** Предельная длина результата инструмента в старых сообщениях. */
const OLD_TOOL_RESULT_CHARS = 1_500;

export interface AgentCheckpoint {
  v: number;
  /** Сколько шагов цикла уже выполнено (общий счётчик для всех провайдеров). */
  step: number;
  messages: AgentMessage[];
  saved_at: Date;
}

function hasToolCalls(message: AgentMessage): message is AgentMessage & { tool_calls: Array<{ id: string }> } {
  return message.role === "assistant" && Array.isArray((message as { tool_calls?: unknown }).tool_calls)
    && ((message as { tool_calls?: unknown[] }).tool_calls?.length ?? 0) > 0;
}

/**
 * Убирает из транскрипта «висячие» вызовы инструментов: assistant с
 * tool_calls, на которые нет полного набора ответов tool, и «осиротевшие»
 * tool-сообщения без своего assistant. Провайдеры (OpenAI-совместимые API)
 * отвечают 400 на такой транскрипт — это ломало бы продолжение после сбоя.
 */
export function repairTranscript(messages: AgentMessage[]): AgentMessage[] {
  const out: AgentMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]!;
    if (message.role === "tool") {
      // tool без assistant перед ним (после обрезки) — пропускаем.
      continue;
    }
    if (hasToolCalls(message)) {
      const ids = new Set(message.tool_calls.map((call) => call.id));
      const answers: AgentMessage[] = [];
      let j = i + 1;
      while (j < messages.length && messages[j]!.role === "tool") {
        const toolId = (messages[j] as { tool_call_id?: string }).tool_call_id ?? "";
        if (ids.has(toolId)) answers.push(messages[j]!);
        j++;
      }
      const answered = new Set(answers.map((a) => (a as { tool_call_id?: string }).tool_call_id ?? ""));
      const complete = [...ids].every((id) => answered.has(id));
      if (!complete) {
        // Вызов не завершён: выбрасываем и сам assistant, и частичные ответы.
        i = j - 1;
        continue;
      }
      out.push(message, ...answers);
      i = j - 1;
      continue;
    }
    out.push(message);
  }
  return out;
}

function shrinkOldToolResults(messages: AgentMessage[], keepFrom: number): AgentMessage[] {
  return messages.map((message, index) => {
    if (index >= keepFrom || message.role !== "tool") return message;
    const content = (message as { content?: unknown }).content;
    if (typeof content !== "string" || content.length <= OLD_TOOL_RESULT_CHARS) return message;
    return { ...message, content: `${content.slice(0, OLD_TOOL_RESULT_CHARS)}…(усечено)` } as AgentMessage;
  });
}

/**
 * Сжимает транскрипт: сохраняет system + исходное задание, середину заменяет
 * короткой пометкой, оставляет хвост из последних сообщений. В отличие от
 * простого slice, хвост не начинается с «осиротевшего» tool-сообщения.
 */
export function compactMessages(messages: AgentMessage[], keepTail = KEEP_TAIL_MESSAGES): AgentMessage[] {
  const repaired = repairTranscript(messages);
  if (repaired.length <= keepTail + 4) return repaired;
  const head = repaired.slice(0, 2);
  let tail = repaired.slice(-keepTail);
  while (tail.length && tail[0]!.role === "tool") tail = tail.slice(1);
  const note: AgentMessage = {
    role: "system",
    content: "(Промежуточные шаги опущены для экономии контекста; продолжайте с текущего состояния.)",
  };
  return repairTranscript([...head, note, ...tail]);
}

/** Собирает контрольную точку, гарантируя предел размера. */
export function buildCheckpoint(step: number, messages: AgentMessage[], now = new Date()): AgentCheckpoint {
  let tailSize = KEEP_TAIL_MESSAGES;
  let compact = shrinkOldToolResults(compactMessages(messages, tailSize), Math.max(0, messages.length - 6));
  // Если даже сжатый вариант велик (огромные результаты) — уменьшаем хвост.
  while (JSON.stringify(compact).length > MAX_CHECKPOINT_CHARS && tailSize > 4) {
    tailSize = Math.floor(tailSize / 2);
    compact = shrinkOldToolResults(compactMessages(messages, tailSize), 0);
  }
  return { v: CHECKPOINT_VERSION, step, messages: compact, saved_at: now };
}

/** Проверяет документ из БД и возвращает пригодную для продолжения точку. */
export function parseCheckpoint(raw: unknown): AgentCheckpoint | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = raw as Record<string, unknown>;
  if (doc.v !== CHECKPOINT_VERSION) return null;
  if (typeof doc.step !== "number" || !Number.isFinite(doc.step) || doc.step < 0) return null;
  if (!Array.isArray(doc.messages) || doc.messages.length < 2) return null;
  const messages = doc.messages as AgentMessage[];
  if (messages.some((m) => !m || typeof m !== "object" || typeof (m as { role?: unknown }).role !== "string")) return null;
  if (messages[0]!.role !== "system") return null;
  const savedAt = doc.saved_at instanceof Date ? doc.saved_at : new Date(0);
  return { v: CHECKPOINT_VERSION, step: Math.floor(doc.step), messages: repairTranscript(messages), saved_at: savedAt };
}
