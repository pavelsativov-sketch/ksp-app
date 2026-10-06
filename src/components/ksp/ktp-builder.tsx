"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveDraftAction } from "@/app/actions/plans";
import { emptyKsp } from "@/lib/types/ksp";

type KtpResult = {
  ktp: {
    title: string;
    rows: Array<{ number: number; topic: string; hours: number; date: string; objectives: string }>;
  };
  docxBase64?: string;
};

export function KtpBuilder({ planId, topic, isPro, grade, subjectId, language }: {
  planId: string;
  topic: string;
  isPro: boolean;
  grade: number;
  subjectId: string | null;
  language: "ru" | "kz";
}) {
  const [open, setOpen] = useState(false);
  const [topics, setTopics] = useState(topic);
  const [startDate, setStartDate] = useState("");
  const [result, setResult] = useState<KtpResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<{ created: number; total: number; done: boolean; failed: number } | null>(null);

  async function generate() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/ktp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, topics: topics.split("\n").map((t) => t.trim()).filter(Boolean), ...(startDate ? { startDate } : {}) }),
      });
      const data = await response.json();
      if (!response.ok || !data.ktp) throw new Error(data.error || "Не удалось создать КТП");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать КТП");
    } finally {
      setLoading(false);
    }
  }

  function download() {
    if (!result?.docxBase64) return;
    const bytes = Uint8Array.from(atob(result.docxBase64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "КТП — черновик.docx";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Пакетное создание черновиков КСП по строкам КТП (без траты AI-квоты). */
  async function createDrafts() {
    if (!result || drafts?.done === false) return;
    const rows = result.ktp.rows;
    setDrafts({ created: 0, total: rows.length, done: false, failed: 0 });
    let created = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        const res = await saveDraftAction({
          title: row.topic,
          subject_id: subjectId,
          grade,
          quarter: null,
          section: null,
          visibility: "private",
          language,
          content: { ...emptyKsp(), topic: row.topic },
        });
        if ("error" in res) failed += 1;
        else created += 1;
      } catch {
        failed += 1;
      }
      setDrafts({ created, total: rows.length, done: false, failed });
    }
    setDrafts({ created, total: rows.length, done: true, failed });
  }

  return (
    <section className="no-print space-y-4 rounded-xl border border-[#ddd5cb] p-5">
      <Button variant="outline" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="ktp-builder">
        {open ? "Скрыть КТП" : "Создать КТП"}
      </Button>
      {open && !isPro && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Календарно-тематический план — фича тарифа Pro.{" "}
          <a href="/pricing" className="font-medium underline">Улучшить до Pro</a>
        </p>
      )}
      {open && isPro && <div id="ktp-builder" className="space-y-4">
        <h2 className="text-xl font-semibold">Календарно-тематический план</h2>
        <p className="text-sm text-slate-600">Черновик для редактирования в Word, не утверждённая учебная программа. По одному часу на тему. Цели из КСП переносятся только для его темы; остальные цели и даты заполните по своей программе. На сервере КТП не сохраняется — скачайте результат.</p>
        <div className="space-y-2">
          <Label htmlFor="ktp-topics">Темы уроков — каждая с новой строки (до 40)</Label>
          <textarea id="ktp-topics" value={topics} onChange={(e) => setTopics(e.target.value)} disabled={loading} rows={5} maxLength={12040} className="w-full rounded-md border border-slate-300 bg-surface p-3 text-sm" />
        </div>
        <div className="max-w-xs space-y-2">
          <Label htmlFor="ktp-date">Дата первого урока (необязательно)</Label>
          <Input id="ktp-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={loading} />
        </div>
        <Button onClick={generate} disabled={loading || !topics.trim()}>{loading ? "Создание КТП…" : "Сформировать таблицу КТП"}</Button>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {result && <div className="space-y-3" aria-live="polite">
          <h3 className="font-semibold">{result.ktp.title}</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">Черновик календарно-тематического плана</caption>
              <thead><tr>{["№", "Тема", "Часы", "Дата", "Цели обучения"].map((label) => <th key={label} scope="col" className="border border-slate-300 bg-slate-50 p-2">{label}</th>)}</tr></thead>
              <tbody>{result.ktp.rows.map((row) => <tr key={row.number}>
                <td className="border border-slate-300 p-2">{row.number}</td>
                <td className="min-w-40 border border-slate-300 p-2">{row.topic}</td>
                <td className="border border-slate-300 p-2">{row.hours}</td>
                <td className="border border-slate-300 p-2">{row.date || "—"}</td>
                <td className="min-w-40 whitespace-pre-line border border-slate-300 p-2">{row.objectives || "Заполните по учебной программе"}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {result.docxBase64 && <Button onClick={download}>Скачать КТП в Word</Button>}
          {!drafts && (
            <Button variant="outline" onClick={() => void createDrafts()}>
              Создать черновики уроков ({result.ktp.rows.length})
            </Button>
          )}
          {drafts && !drafts.done && (
            <p role="status" className="text-sm text-slate-600">
              Создаём черновики… {drafts.created}/{drafts.total}
            </p>
          )}
          {drafts?.done && (
            <p role="status" className="text-sm text-emerald-700">
              Готово: черновиков {drafts.created} из {drafts.total}
              {drafts.failed > 0 ? ` (не удалось: ${drafts.failed})` : ""}.{" "}
              <Link href="/dashboard" className="font-medium underline">Открыть архив</Link>
            </p>
          )}
        </div>}
      </div>}
    </section>
  );
}
