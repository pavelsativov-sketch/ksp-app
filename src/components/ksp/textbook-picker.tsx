"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TextbookItem {
  id: string;
  title: string;
  status: "pending" | "indexing" | "ready" | "error";
  grade: number | null;
  chunk_count: number;
}

const NONE = "__none__";

export function TextbookPicker({
  value,
  onChange,
  grade,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  grade?: number;
}) {
  const [items, setItems] = useState<TextbookItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/textbooks");
        if (!res.ok) return;
        const data = (await res.json()) as { textbooks?: TextbookItem[] };
        if (cancelled) return;
        setItems(data.textbooks ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Сортируем: ready сначала, затем по совпадению класса.
  const sorted = [...items]
    .filter((t) => t.status === "ready")
    .sort((a, b) => {
      const matchA = grade && a.grade === grade ? 1 : 0;
      const matchB = grade && b.grade === grade ? 1 : 0;
      return matchB - matchA;
    });

  if (loading) {
    return (
      <div className="text-xs text-slate-500 flex items-center gap-1">
        <Loader2 className="w-3 h-3 animate-spin" />
        Загрузка учебников…
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="text-xs text-slate-500">
        Нет загруженных учебников.{" "}
        <Link href="/textbooks" className="text-sky-600 hover:underline">
          Загрузить PDF
        </Link>
        {" "}— AI будет цитировать его при генерации плана.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <BookOpen className="w-4 h-4 text-slate-400 shrink-0" />
      <Select
        value={value ?? NONE}
        onValueChange={(v) => onChange(v === NONE ? null : v)}
      >
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder="Без учебника" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— без учебника —</SelectItem>
          {sorted.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.title}
              {t.grade ? ` (${t.grade} кл.)` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Link href="/textbooks" className="text-xs text-sky-600 hover:underline whitespace-nowrap">
        Управление
      </Link>
    </div>
  );
}
