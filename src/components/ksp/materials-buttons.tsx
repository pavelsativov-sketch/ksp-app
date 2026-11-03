"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownUp, CircleHelp, ListChecks, Loader2, MousePointerClick, Radio, ScrollText, Shuffle, Sparkles, TextCursorInput, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { FORMAT_COUNTS, type InteractiveFormat } from "@/lib/materials/interactive-formats";

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

type FormatCard = { id: InteractiveFormat; title: string; text: string; icon: LucideIcon };

const FORMAT_CARDS: FormatCard[] = [
  { id: "live", title: "Live-квиз", text: "Весь класс отвечает с телефонов, на экране таблица лидеров.", icon: Radio },
  { id: "mcq", title: "Выбери ответ", text: "Вопросы с вариантами, ученик проходит по коду.", icon: ListChecks },
  { id: "truefalse", title: "Верно или неверно", text: "Быстрая проверка понимания утверждений.", icon: CircleHelp },
  { id: "fill", title: "Вставь пропуски", text: "Предложения, в которых не хватает ключевых слов.", icon: TextCursorInput },
  { id: "match", title: "Найди пары", text: "Соединить термин с определением или пример с ответом.", icon: Shuffle },
  { id: "order", title: "Расставь по порядку", text: "Шаги алгоритма или этапы процесса.", icon: ArrowDownUp },
];

/** Интерактив: учитель выбирает формат, ИИ делает задания по плану и добавляет их в урок. */
export function InteractiveButton({ planId }: { planId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<InteractiveFormat>("live");
  const [count, setCount] = useState(FORMAT_COUNTS.live[0]!);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function choose(next: InteractiveFormat) {
    setFormat(next);
    setCount(FORMAT_COUNTS[next][0]!);
    setError("");
  }

  async function run() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = await postJson<{ added: number }>("/api/materials/interactive", { planId, format, count });
      if (format === "live") {
        router.push(`/quiz/host/${planId}?take=${data.added}`);
        return;
      }
      setOpen(false);
      setMessage(`Добавлено заданий: ${data.added}. Они в ходе урока, выдайте их кнопкой «Задать домой» или проведите на доске.`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <MousePointerClick /> Выбрать интерактив
      </Button>
      {message && <p role="status" className="max-w-72 text-xs text-muted-foreground">{message}</p>}
      <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}>
        <DialogContent className="w-full max-w-2xl rounded-2xl bg-surface p-5 shadow-2xl" overlayClassName="overflow-y-auto p-4" aria-label="Выбор интерактива">
          <DialogTitle className="text-lg font-extrabold">Какой интерактив провести?</DialogTitle>
          <div role="radiogroup" aria-label="Формат интерактива" className="mt-3 grid gap-2 sm:grid-cols-2">
            {FORMAT_CARDS.map((card) => {
              const Icon = card.icon;
              const active = card.id === format;
              return (
                <button
                  key={card.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={busy}
                  onClick={() => choose(card.id)}
                  className={`flex items-start gap-3 rounded-xl border-2 p-3 text-left transition-colors ${active ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}
                >
                  <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                  <span><b className="block text-sm">{card.title}</b><span className="text-xs text-muted-foreground">{card.text}</span></span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm font-semibold">
              Сколько заданий
              <select value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={busy} className="h-9 rounded-md border border-border bg-surface px-2 text-sm">
                {FORMAT_COUNTS[format].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Отмена</Button>
              <Button type="button" onClick={run} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {format === "live" ? "Создать и запустить" : "Создать"}
              </Button>
            </div>
          </div>
          {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
