"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { usePlanAi } from "@/components/ksp/hooks/use-plan-ai";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { mergeAiIntoKsp } from "@/lib/ai/merge";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import type { AiKspPayload } from "@/lib/ai/prompt";
import type { AiHistoryPublic } from "@/lib/ai/history";
import { emptyKsp, type KspContent } from "@/lib/types/ksp";

type ApiResp = { items: AiHistoryPublic[]; cutoff: string; ttlDays: number };

function localDiff(before: KspContent, after: KspContent) {
  const out: { label: string; filled: boolean; preview: string }[] = [];
  const str = (v: unknown): string => (Array.isArray(v) ? v.map(String).join("; ") : String(v ?? ""));
  const push = (label: string, b: unknown, a: unknown) => {
    const bs = str(b).trim();
    const as = str(a).trim();
    if (!as || as === bs) return;
    out.push({ label, filled: !bs, preview: as.slice(0, 140) + (as.length > 140 ? "…" : "") });
  };
  push("Тема", before.topic, after.topic);
  push("Цели", before.learningObjectives, after.learningObjectives);
  return out;
}

export function AiHistoryClient() {
  const { locale, t } = useUiLocale();
  const pe = t.planEditor;
  const [items, setItems] = useState<AiHistoryPublic[]>([]);
  const [cutoff, setCutoff] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replaying, setReplaying] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ merged: KspContent; diff: ReturnType<typeof localDiff> } | null>(null);
  const ai = usePlanAi({ historyKey: "history-page" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai/history?limit=50", { cache: "no-store" });
        const data = (await res.json()) as ApiResp & { error?: string };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        if (cancelled) return;
        setItems(data.items ?? []);
        setCutoff(data.cutoff ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function replay(item: AiHistoryPublic) {
    setReplaying(item.id);
    setError(null);
    try {
      const payload = await ai.generateWithAi({
        grade: item.params.grade,
        subjectName: item.params.subject,
        topic: item.params.topic,
        learningObjectives: item.params.learningObjectives,
        language: item.params.language as "ru" | "kz",
        schoolProfile: (item.params.schoolProfile as "emn" | "ogn" | undefined) ?? undefined,
        section: item.params.section ?? undefined,
        previousTopic: item.params.previousTopic ?? undefined,
        textbookId: item.params.textbookId ?? null,
        armanpvId: item.params.armanpvId ?? null,
        planRevision: null,
      });
      if (!payload) {
        setError(ai.aiError ?? "Повтор не удался");
        return;
      }
      const merged = mergeAiIntoKsp(emptyKsp(), payload as AiKspPayload);
      const diff = localDiff(emptyKsp(), merged);
      setPreview({ merged, diff });
    } finally {
      setReplaying(null);
    }
  }

  if (loading) return <p className="mt-6 text-sm text-muted-foreground">Загрузка…</p>;
  if (error) return <p className="mt-6 text-sm text-destructive">{error}</p>;

  return (
    <div className="mt-6 space-y-4">
      {cutoff && <p className="text-xs text-muted-foreground">Храним с {new Date(cutoff).toLocaleDateString(locale === "kk" ? "kk-KZ" : "ru-RU")} · TTL 90 дней</p>}
      {ai.aiError && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{ai.aiError}</p>}
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">История пуста. Сгенерируйте первый план — запись появится здесь автоматически.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={it.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{it.params.topic || "—"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(it.createdAt).toLocaleString(locale === "kk" ? "kk-KZ" : "ru-RU")} · {it.params.subject} · {it.params.grade} кл · {it.model} · v{it.schema_version}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">paramsHash {it.paramsHash.slice(0, 12)} · source_ids {it.source_ids.length} · {it.rag.method ?? "—"} · {it.rag.chunkCount} фрагм.</p>
                  {it.rag.textbookTitle && <p className="mt-1 text-xs text-muted-foreground">{it.rag.textbookTitle}</p>}
                </div>
                <Button size="sm" variant="outline" onClick={() => void replay(it)} disabled={ai.aiLoading || replaying === it.id}>
                  {replaying === it.id ? "Генерация…" : "Повторить (предпросмотр)"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {preview && (
        <Dialog open onOpenChange={(open) => { if (!open) setPreview(null); }}>
          <DialogContent className="max-w-2xl rounded-xl bg-surface p-5 shadow-2xl" overlayClassName="overflow-y-auto p-4" aria-label={pe.aiDialog.aria}>
            <DialogTitle className="text-lg font-bold">Предпросмотр повтора — план не перезаписан</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-slate-600">{pe.aiDialog.desc} Закройте окно, чтобы отбросить — изменения не применяются автоматически.</DialogDescription>
            <ul className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto">
              {preview.diff.slice(0, 20).map((d) => (
                <li key={d.label} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
                  <p className="font-medium">{d.label} <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] ${d.filled ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{d.filled ? pe.aiDialog.tagNew : pe.aiDialog.tagOverwrite}</span></p>
                  <p className="mt-1 text-slate-600">{d.preview}</p>
                </li>
              ))}
            </ul>
            {preview.diff.length > 20 && <p className="mt-2 text-xs text-slate-500">…и ещё {preview.diff.length - 20}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPreview(null)} type="button">{pe.aiDialog.reject}</Button>
              <Button onClick={() => setPreview(null)} type="button">Закрыть (без применения)</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
