"use client";

import { useState } from "react";
import { BookOpenText, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface GlossaryPair {
  ru: string;
  kk: string;
}

/** Разбирает строку «термин RU — термин KK» в пару. */
export function parseGlossaryLine(line: string): GlossaryPair | null {
  const m = line.split(/\s+[—–-]\s+|\s*—\s*/);
  const parts = m.map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return { ru: parts[0], kk: parts.slice(1).join(" — ") };
}

/**
 * Глоссарий RU–KK по теме урока: таблица переводов терминов + кнопка
 * «добавить термины» (дописывает недостающие RU-термины в языковые цели).
 */
export function GlossaryButton({
  terms,
  context,
  onAddTerms,
}: {
  terms: string[];
  context: { topic: string; subject: string; grade: number; language: "ru" | "kz" };
  onAddTerms: (ruTerms: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pairs, setPairs] = useState<GlossaryPair[]>([]);
  const [added, setAdded] = useState(false);

  async function run() {
    setErr(null);
    setAdded(false);
    setLoading(true);
    try {
      const res = await fetch("/api/ai/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "glossary", current: terms, context }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { improved: string | string[] };
      const lines = Array.isArray(data.improved) ? data.improved : String(data.improved).split("\n");
      setPairs(lines.map(parseGlossaryLine).filter((p): p is GlossaryPair => p !== null).slice(0, 20));
      setOpen(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка AI");
    } finally {
      setLoading(false);
    }
  }

  function addMissing() {
    const have = new Set(terms.map((t) => t.trim().toLowerCase()));
    const missing = pairs.map((p) => p.ru).filter((ru) => ru && !have.has(ru.toLowerCase()));
    if (missing.length) onAddTerms(missing);
    setAdded(true);
  }

  return (
    <div className="relative">
      <Button type="button" variant="ghost" size="sm" onClick={run} disabled={loading} title="Переводы терминов на казахский">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpenText className="w-4 h-4" />}
        Глоссарий RU–KK
      </Button>
      {err && <span className="text-xs text-red-600">{err}</span>}
      {open && !loading && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-slate-200 bg-surface p-3 shadow-lg">
          <p className="text-sm font-medium">Глоссарий по теме</p>
          {pairs.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">Переводы не получены. Проверьте термины и попробуйте ещё раз.</p>
          ) : (
            <>
              <table className="mt-2 w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="border-b p-1">RU</th>
                    <th className="border-b p-1">KK</th>
                  </tr>
                </thead>
                <tbody>
                  {pairs.map((p, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="p-1">{p.ru}</td>
                      <td className="p-1">{p.kk}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!added ? (
                <Button type="button" variant="outline" size="sm" onClick={addMissing} className="mt-2 w-full">
                  <Plus className="w-3.5 h-3.5" /> Добавить термины (RU)
                </Button>
              ) : (
                <p role="status" className="mt-2 text-xs text-emerald-700">Недостающие термины добавлены.</p>
              )}
            </>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} className="mt-1 w-full">
            Закрыть
          </Button>
        </div>
      )}
    </div>
  );
}
