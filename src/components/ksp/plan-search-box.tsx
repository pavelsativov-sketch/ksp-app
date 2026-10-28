"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface SearchResult {
  id: string;
  title: string;
  grade: number;
  topic: string | null;
  updatedAt: string | null;
}

/** Поиск по своим планам: заголовок/тема, с задержкой ввода. */
export function PlanSearchBox() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const seqRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const seq = ++seqRef.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/plans/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error("search failed");
        const data = (await res.json()) as { items?: SearchResult[] };
        if (seq === seqRef.current) setItems(data.items ?? []);
      } catch {
        if (seq === seqRef.current) setItems([]);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="relative space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            if (!next.trim()) setItems([]);
          }}
          placeholder="Поиск по моим планам (тема, название)"
          className="pl-9"
          aria-label="Поиск по моим планам"
        />
      </div>
      {query.trim() && (
        <div className="absolute z-20 w-full rounded-xl border border-border bg-surface shadow-card">
          {loading && (
            <p className="px-4 py-3 text-sm text-muted-foreground">Ищем…</p>
          )}
          {!loading && items.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted-foreground">Ничего не найдено</p>
          )}
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/plans/${item.id}`}
              className="block border-b border-border/60 px-4 py-3 last:border-0 hover:bg-muted"
            >
              <p className="text-sm font-semibold">{item.title}</p>
              <p className="text-xs text-muted-foreground">
                {item.grade} класс{item.topic ? ` · ${item.topic}` : ""}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
