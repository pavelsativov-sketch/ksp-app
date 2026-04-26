"use client";

import { useEffect, useMemo, useState } from "react";
import { BookCheck, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface GosoObjective {
  id: string;
  code: string;
  text_ru: string;
  text_kz: string | null;
  grade: number;
  section: string | null;
}

interface Props {
  subjectId: string;
  grade: number;
  selectedCodes: string[];
  onAdd: (objectives: Array<{ code: string; text: string }>) => void;
}

export function ObjectivesPicker({
  subjectId,
  grade,
  selectedCodes,
  onAdd,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<GosoObjective[]>([]);
  const [search, setSearch] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/objectives?subjectId=${encodeURIComponent(subjectId)}&grade=${grade}`,
          { signal: ctrl.signal },
        );
        const data = (await res.json()) as {
          objectives?: GosoObjective[];
          error?: string;
        };
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          setItems([]);
        } else {
          setItems(data.objectives ?? []);
        }
      } catch (e) {
        if (!cancelled && (e as Error).name !== "AbortError") {
          setError(String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [open, subjectId, grade]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (o) =>
        o.code.toLowerCase().includes(q) ||
        o.text_ru.toLowerCase().includes(q) ||
        (o.section?.toLowerCase().includes(q) ?? false),
    );
  }, [items, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, GosoObjective[]>();
    for (const o of filtered) {
      const key = o.section ?? "Без раздела";
      const list = map.get(key);
      if (list) list.push(o);
      else map.set(key, [o]);
    }
    return Array.from(map.entries());
  }, [filtered]);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addSelected() {
    const rows = items
      .filter((o) => checked.has(o.id))
      .map((o) => ({ code: o.code, text: o.text_ru }));
    if (rows.length > 0) onAdd(rows);
    setChecked(new Set());
    setOpen(false);
    setSearch("");
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!subjectId}
      >
        <BookCheck className="w-4 h-4 mr-1" />
        Выбрать из программы (ГОСО)
      </Button>
    );
  }

  return (
    <div className="border border-slate-300 rounded-lg bg-white shadow-sm">
      <div className="flex items-center gap-2 p-3 border-b border-slate-200">
        <Search className="w-4 h-4 text-slate-400" />
        <Input
          placeholder="Поиск по коду, тексту или разделу"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setChecked(new Set());
          }}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {loading && (
          <div className="p-6 flex items-center justify-center text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Загрузка целей обучения…
          </div>
        )}
        {error && (
          <div className="p-4 text-sm text-red-600">
            {error}. Проверьте, применены ли миграции 0003 и seed GOSO.
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="p-6 text-sm text-slate-500 text-center">
            Цели для этого предмета и класса не найдены. Запустите{" "}
            <code className="px-1 py-0.5 bg-slate-100 rounded">npm run seed:goso</code>.
          </div>
        )}
        {grouped.map(([section, list]) => (
          <div key={section} className="py-1">
            <div className="px-3 py-1 text-xs font-semibold text-slate-500 bg-slate-50 sticky top-0">
              {section}
            </div>
            {list.map((o) => {
              const already = selectedCodes.includes(o.code);
              return (
                <label
                  key={o.id}
                  className={`flex items-start gap-2 px-3 py-2 border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${
                    already ? "opacity-50" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked.has(o.id)}
                    disabled={already}
                    onChange={() => toggle(o.id)}
                  />
                  <div className="flex-1 text-sm">
                    <span className="font-mono text-slate-700 mr-2">{o.code}</span>
                    <span>{o.text_ru}</span>
                    {already && (
                      <span className="text-xs text-slate-400 ml-2">
                        (уже добавлена)
                      </span>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between p-3 border-t border-slate-200 bg-slate-50">
        <span className="text-sm text-slate-600">
          Выбрано: {checked.size}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpen(false);
              setChecked(new Set());
            }}
          >
            Отмена
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={addSelected}
            disabled={checked.size === 0}
          >
            Добавить ({checked.size})
          </Button>
        </div>
      </div>
    </div>
  );
}
