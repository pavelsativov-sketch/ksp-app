/**
 * Tiny client-side SSE consumer over `fetch`.
 *
 * `EventSource` would be simpler but it only supports GET, and our streaming
 * endpoints are POST (so we can carry a JSON body). This helper reads the
 * response body as a stream, parses Server-Sent Events, and dispatches each
 * one to a single onEvent handler.
 *
 * Returns a Promise that resolves when the stream closes.
 */

export interface SseEvent {
  event: string;
  data: unknown;
}

export interface PostSseOptions {
  /** Fully-formed POST body (will be JSON-stringified). */
  body: unknown;
  signal?: AbortSignal;
  onEvent: (e: SseEvent) => void;
}

export async function postSse(
  url: string,
  opts: PostSseOptions,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(opts.body),
    signal: opts.signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (!res.body) throw new Error("No response body for SSE");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line (\n\n).
    let sep = buffer.indexOf("\n\n");
    while (sep !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const parsed = parseSseFrame(frame);
      if (parsed) opts.onEvent(parsed);
      sep = buffer.indexOf("\n\n");
    }
  }
  // Flush any trailing frame without the closing blank line.
  const tail = buffer.trim();
  if (tail) {
    const parsed = parseSseFrame(tail);
    if (parsed) opts.onEvent(parsed);
  }
}

function parseSseFrame(frame: string): SseEvent | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const raw of frame.split("\n")) {
    const line = raw.trimEnd();
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }
  if (dataLines.length === 0) return null;
  const dataStr = dataLines.join("\n");
  let data: unknown = dataStr;
  try {
    data = JSON.parse(dataStr);
  } catch {
    /* leave as string */
  }
  return { event, data };
}
