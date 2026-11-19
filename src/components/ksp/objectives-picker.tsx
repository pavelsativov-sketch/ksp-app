"use client";

import { useEffect, useMemo, useState } from "react";
import { BookCheck, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import type { SchoolProfile } from "@/lib/types/ksp";

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
  subjectName?: string;
  grade: number;
  selectedCodes: string[];
  onAdd: (objectives: Array<{ code: string; text: string }>) => void;
  schoolProfile?: SchoolProfile;
  language?: "ru" | "kz";
}

export function ObjectivesPicker({
  subjectId,
  subjectName,
  grade,
  selectedCodes,
  onAdd,
  schoolProfile,
  language = "ru",
}: Props) {
  const { locale } = useUiLocale();
  const isKz = language === "kz" || locale === "kk";
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<GosoObjective[]>([]);
  const [source, setSource] = useState<"db" | "local" | "tup" | null>(null);
  const [sourceNote, setSourceNote] = useState<string | null>(null);
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
        const params = new URLSearchParams();
        if (subjectId) params.set("subjectId", subjectId);
        if (subjectName) params.set("subject", subjectName);
        params.set("grade", String(grade));
        if (schoolProfile) params.set("schoolProfile", schoolProfile);
        if (isKz) params.set("lang", "kz");
        const res = await fetch(`/api/objectives?${params.toString()}`, {
          signal: ctrl.signal,
        });
        const data = (await res.json()) as {
          objectives?: GosoObjective[];
          error?: string;
          source?: "db" | "local" | "tup";
          note?: string;
        };
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          setItems([]);
        } else {
          setItems(data.objectives ?? []);
          setSource(data.source ?? null);
          setSourceNote(data.note ?? null);
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
  }, [open, subjectId, subjectName, grade, schoolProfile, isKz]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (o) =>
        o.code.toLowerCase().includes(q) ||
        o.text_ru.toLowerCase().includes(q) ||
        (o.text_kz?.toLowerCase().includes(q) ?? false) ||
        (o.section?.toLowerCase().includes(q) ?? false),
    );
  }, [items, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, GosoObjective[]>();
    const fallbackSection = isKz ? "Бөлімсіз" : "Без раздела";
    for (const o of filtered) {
      const key = o.section ?? fallbackSection;
      const list = map.get(key);
      if (list) list.push(o);
      else map.set(key, [o]);
    }
    return Array.from(map.entries());
  }, [filtered, isKz]);

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
      .map((o) => ({
        code: o.code,
        text: isKz && o.text_kz ? o.text_kz : o.text_ru,
      }));
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
        disabled={!subjectId && !subjectName}
      >
        <BookCheck className="w-4 h-4 mr-1" />
        {isKz ? "ТОБ-дан таңдау" : "Выбрать из ТУП"}
      </Button>
    );
  }

  return (
    <div className="border border-border rounded-lg bg-surface shadow-sm">
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <Search className="w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={isKz ? "Код, мәтін немесе бөлім бойынша іздеу" : "Поиск по коду, тексту или разделу"}
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

      {(source === "local" || source === "tup") && (
        <div className="px-3 py-2 text-xs text-warning bg-warning-soft border-b border-warning/40">
          {source === "tup"
            ? isKz
              ? "Информатика бойынша өзекті ТОБ."
              : "Актуальный ТУП для информатики."
            : isKz
              ? "МЖМБС (ГОСО) жергілікті анықтамалығы."
              : "Локальный справочник ТУП."}{" "}
          {sourceNote ?? ""}
        </div>
      )}
      <div className="max-h-96 overflow-y-auto">
        {loading && (
          <div className="p-6 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            {isKz ? "Оқу мақсаттары жүктелуде…" : "Загрузка целей обучения…"}
          </div>
        )}
        {error && (
          <div className="p-4 text-sm text-red-600">
            {error}
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground text-center">
            {isKz
              ? "Бұл пән мен сынып бойынша оқу мақсаттары табылмады."
              : "Цели для этого предмета и класса не найдены."}
          </div>
        )}
        {grouped.map(([section, list]) => (
          <div key={section} className="py-1">
            <div className="px-3 py-1 text-xs font-semibold text-muted-foreground bg-muted sticky top-0">
              {section}
            </div>
            {list.map((o) => {
              const already = selectedCodes.includes(o.code);
              return (
                <label
                  key={o.id}
                  className={`flex items-start gap-2 px-3 py-2 border-b border-border hover:bg-muted cursor-pointer ${
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
                    <span className="tabular-nums text-foreground mr-2">{o.code}</span>
                    <span>{isKz && o.text_kz ? o.text_kz : o.text_ru}</span>
                    {already && (
                      <span className="text-xs text-muted-foreground ml-2">
                        {isKz ? "(қосылған)" : "(уже добавлена)"}
                      </span>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between p-3 border-t border-border bg-muted">
        <span className="text-sm text-muted-foreground">
          {isKz ? "Таңдалды" : "Выбрано"}: {checked.size}
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
            {isKz ? "Болдырмау" : "Отмена"}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={addSelected}
            disabled={checked.size === 0}
          >
            {isKz ? "Қосу" : "Добавить"} ({checked.size})
          </Button>
        </div>
      </div>
    </div>
  );
}
