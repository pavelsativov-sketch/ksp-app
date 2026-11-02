"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MousePointerClick, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Не удалось выполнить действие");
  return data;
}

function downloadDocx(base64: string, fileName: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** Слова педагога: ИИ пишет живую речь по плану, файл скачивается сразу. */
export function TeacherSpeechButton({ planId }: { planId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    try {
      const data = await postJson<{ docxBase64: string; fileName: string }>("/api/materials/teacher-speech", { planId });
      downloadDocx(data.docxBase64, data.fileName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="outline" onClick={run} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <ScrollText />} Слова педагога
      </Button>
      {error && <p role="alert" className="max-w-56 text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Интерактив: 5–10 вопросов с выбором добавляются в урок и выдаются ученикам по коду. */
export function InteractiveButton({ planId }: { planId: string }) {
  const router = useRouter();
  const [count, setCount] = useState(7);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = await postJson<{ added: number }>("/api/materials/interactive", { planId, count });
      setMessage(`Добавлено ${data.added} вопросов. Выдайте их ученикам кнопкой «Выдать задание».`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Button type="button" variant="outline" onClick={run} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <MousePointerClick />} Интерактив
        </Button>
        <select
          aria-label="Сколько вопросов в интерактиве"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          disabled={busy}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          {[5, 6, 7, 8, 9, 10].map((n) => (
            <option key={n} value={n}>{n} выборов</option>
          ))}
        </select>
      </div>
      {message && <p role="status" className="max-w-72 text-xs text-muted-foreground">{message}</p>}
      {error && <p role="alert" className="max-w-72 text-xs text-destructive">{error}</p>}
    </div>
  );
}
