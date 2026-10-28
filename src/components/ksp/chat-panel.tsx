"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Bot, User, Loader2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Msg = { role: "user" | "assistant"; content: string };

const MAX_STORED = 20;

/**
 * Чат-ассистент.
 *
 * Раньше ответ ждал целиком (до 30 с) и сообщения жили только в памяти.
 * Теперь: потоковый ответ по SSE, кнопка «Стоп», история диалога хранится
 * в sessionStorage по плану и переживает перезагрузку страницы.
 */
export function ChatPanel({
  planContext,
}: {
  planContext: {
    topic?: string;
    subject?: string;
    grade?: number;
    language?: "ru" | "kz";
    content?: unknown;
  };
}) {
  const storageKey = `ksp-chat:${planContext.topic?.trim().slice(0, 60) ?? "default"}`;
  const [messages, setMessages] = useState<Msg[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        return parsed.filter((m): m is Msg => {
          if (typeof m !== "object" || m === null) return false;
          const role = (m as Msg).role;
          const content = (m as Msg).content;
          return (role === "user" || role === "assistant") && typeof content === "string";
        }).slice(-MAX_STORED);
      }
    } catch {
      // sessionStorage — опциональное локальное удобство
    }
    return [];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(messages.slice(-MAX_STORED)));
    } catch {
      // сессионное хранилище заполнено/недоступно — игнорируем
    }
  }, [messages, storageKey]);

  function appendAssistant(text: string) {
    setMessages((prev) => {
      const hasAssistantAtEnd = prev[prev.length - 1]?.role === "assistant";
      return hasAssistantAtEnd
        ? [...prev.slice(0, -1), { role: "assistant", content: text }]
        : [...prev, { role: "assistant", content: text }];
    });
  }

  function scrollBottom() {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    });
  }

  async function send() {
    const q = input.trim();
    if (!q || loading) return;
    setError(null);
    const nextHistory: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(nextHistory);
    setInput("");
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/ai/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, planContext, history: messages.slice(-8) }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        let message = text.slice(0, 300);
        const m = text.match(/data:\s*(\{.*\})/);
        if (m) {
          try {
            const ev = JSON.parse(m[1]) as { error?: string };
            if (ev.error) message = ev.error;
          } catch {
            // оставляем сырой текст
          }
        }
        throw new Error(message || `Сервер ответил ${res.status}`);
      }
      if (!res.body) throw new Error("Сервер не вернул поток ответа");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      let failed: string | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 2);
          if (frame.startsWith("data:")) {
            try {
              const ev = JSON.parse(frame.slice(5).trim()) as {
                type?: string;
                text?: string;
                answer?: string;
                error?: string;
              };
              if (ev.type === "token" && typeof ev.text === "string") {
                answer += ev.text;
                appendAssistant(answer);
                scrollBottom();
              } else if (ev.type === "done") {
                appendAssistant(ev.answer ?? answer);
                scrollBottom();
              } else if (ev.type === "error") {
                failed = ev.error ?? "Ошибка чата";
              }
            } catch {
              // повреждённый кадр — пропускаем
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
        if (failed) break;
      }
      if (failed) throw new Error(failed);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        setError("Ответ прерван");
      } else {
        setError(e instanceof Error ? e.message : "Ошибка");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    setLoading(false);
  }

  return (
    <Card className="flex h-[520px] flex-col">
      <CardHeader className="py-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="size-4" /> Чат-ассистент
          <span className="text-xs font-normal text-muted-foreground">— спросите, не перегенерируя план</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <div
          ref={listRef}
          className="flex-1 space-y-3 overflow-y-auto rounded-lg border bg-muted/30 p-3"
          aria-live="polite"
        >
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Задайте вопрос по уроку: «Как улучшить критерии?», «Подскажи дифференциацию для слабых», «Переформулируй цели короче».
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-white border shadow-sm"
                }`}
              >
                <div className="mb-1 flex items-center gap-1 text-[11px] opacity-70">
                  {m.role === "user" ? <User className="size-3" /> : <Bot className="size-3" />}
                  {m.role === "user" ? "Вы" : "Ассистент"}
                </div>
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Печатает…
            </div>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Спросите ассистента…"
            rows={2}
            className="min-h-[44px] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          {loading ? (
            <Button onClick={stop} size="icon" variant="outline" aria-label="Остановить ответ">
              <Square className="size-4" />
            </Button>
          ) : (
            <Button onClick={() => void send()} disabled={!input.trim()} size="icon" aria-label="Отправить">
              <Send className="size-4" />
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">Enter — отправить, Shift+Enter — новая строка. Ответ не меняет план автоматически. Диалог сохраняется в этой вкладке.</p>
      </CardContent>
    </Card>
  );
}
