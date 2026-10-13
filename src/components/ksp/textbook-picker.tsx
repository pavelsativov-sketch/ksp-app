"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, ExternalLink, Loader2, Sparkles } from "lucide-react";
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
  subject_id?: string | null;
  chunk_count: number;
  armanpv_id?: string | null;
  source_url?: string | null;
  language?: string | null;
}

interface ArmanPvCatalogEntry {
  id: string;
  grade: number;
  title: string;
  description: string;
  language: "ru" | "kz" | "ug" | "uz";
  subjectNameRu: string | null;
  subjectId: string | null;
  isGuide: boolean;
  pdfUrl: string;
  ingestedTextbookId: string | null;
  status: "not_ingested" | "pending" | "indexing" | "ready" | "error";
  chunkCount: number;
}

const NONE = "__none__";
const ARMAN_PREFIX = "arman:";

export function TextbookPicker({
  value,
  onChange,
  armanpvId,
  onArmanPvChange,
  grade,
  subjectId,
  subjectName,
  language,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  armanpvId?: string | null;
  onArmanPvChange?: (armanpvId: string | null) => void;
  grade?: number;
  subjectId?: string;
  subjectName?: string;
  language?: "ru" | "kz";
}) {
  const [items, setItems] = useState<TextbookItem[]>([]);
  const [armanCatalog, setArmanCatalog] = useState<ArmanPvCatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [importingArmanId, setImportingArmanId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [tbRes, armanRes] = await Promise.all([
          fetch("/api/textbooks").catch(() => null),
          fetch(`/api/textbooks/armanpv${grade ? `?grade=${grade}` : ""}`).catch(() => null),
        ]);
        if (cancelled) return;
        if (tbRes?.ok) {
          const data = (await tbRes.json()) as { textbooks?: TextbookItem[] };
          if (!cancelled) setItems(data.textbooks ?? []);
        }
        if (armanRes?.ok) {
          const data = (await armanRes.json()) as { items?: ArmanPvCatalogEntry[] };
          if (!cancelled) setArmanCatalog(data.items ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [grade]);

  const readyTextbooks = useMemo(() => {
    return [...items]
      .filter((t) => t.status === "ready")
      .sort((a, b) => {
        const gradeA = grade && a.grade === grade ? 2 : 0;
        const gradeB = grade && b.grade === grade ? 2 : 0;
        const subjA = subjectId && a.subject_id === subjectId ? 2 : 0;
        const subjB = subjectId && b.subject_id === subjectId ? 2 : 0;
        const langA = language && a.language === language ? 1 : 0;
        const langB = language && b.language === language ? 1 : 0;
        return gradeB + subjB + langB - (gradeA + subjA + langA);
      });
  }, [items, grade, subjectId, language]);

  const ingestedArmanIds = useMemo(() => {
    const s = new Set<string>();
    for (const t of readyTextbooks) {
      if (t.armanpv_id) s.add(t.armanpv_id);
    }
    return s;
  }, [readyTextbooks]);

  // Учебники Арман-ПВ для выбранного класса, которые ещё не проиндексированы (либо готовы к подключению в 1 клик)
  const availableArmanCatalog = useMemo(() => {
    const subjLower = (subjectName ?? "").trim().toLowerCase();
    return [...armanCatalog]
      .filter((c) => !ingestedArmanIds.has(c.id))
      .sort((a, b) => {
        const subjA =
          subjLower && (a.subjectNameRu ?? "").toLowerCase() === subjLower
            ? 4
            : subjectId && a.subjectId === subjectId
              ? 4
              : 0;
        const subjB =
          subjLower && (b.subjectNameRu ?? "").toLowerCase() === subjLower
            ? 4
            : subjectId && b.subjectId === subjectId
              ? 4
              : 0;
        const langA = language && a.language === language ? 2 : 0;
        const langB = language && b.language === language ? 2 : 0;
        const guideA = a.isGuide ? 0 : 1;
        const guideB = b.isGuide ? 0 : 1;
        return subjB + langB + guideB - (subjA + langA + guideA);
      });
  }, [armanCatalog, ingestedArmanIds, subjectName, subjectId, language]);

  // Лучшая рекомендация Арман-ПВ по текущему классу + предмету + языку
  const recommendedArman = useMemo(() => {
    const subjLower = (subjectName ?? "").trim().toLowerCase();
    if (!subjLower && !subjectId) return null;
    // Сначала проверим уже готовые учебники Арман-ПВ
    const readyMatch = readyTextbooks.find(
      (t) =>
        t.armanpv_id &&
        (!grade || t.grade === grade) &&
        ((subjectId && t.subject_id === subjectId) ||
          (subjLower && t.title.toLowerCase().includes(subjLower.slice(0, 5)))) &&
        (!language || !t.language || t.language === language),
    );
    if (readyMatch) return { type: "ready" as const, textbook: readyMatch };

    const catalogMatch = availableArmanCatalog.find(
      (c) =>
        !c.isGuide &&
        ((subjLower && (c.subjectNameRu ?? "").toLowerCase() === subjLower) ||
          (subjectId && c.subjectId === subjectId)) &&
        (!language || c.language === language),
    );
    if (catalogMatch) return { type: "catalog" as const, item: catalogMatch };
    return null;
  }, [readyTextbooks, availableArmanCatalog, grade, subjectId, subjectName, language]);

  async function handleSelectArmanItem(catalogItemId: string) {
    setImportError(null);
    onArmanPvChange?.(catalogItemId);
    setImportingArmanId(catalogItemId);
    try {
      const res = await fetch("/api/textbooks/armanpv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          armanpvId: catalogItemId,
          subjectId: subjectId || null,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        textbook?: TextbookItem;
      };
      if (!res.ok || !data.textbook) {
        throw new Error(data.error ?? "Не удалось подключить учебник Арман-ПВ");
      }
      const tb = data.textbook;
      setItems((prev) => {
        const exists = prev.some((p) => p.id === tb.id);
        return exists ? prev.map((p) => (p.id === tb.id ? tb : p)) : [tb, ...prev];
      });
      onChange(tb.id);
    } catch (e) {
      setImportError(
        e instanceof Error
          ? e.message
          : "Не удалось скачать учебник с armanpv.com (при генерации повторим попытку)",
      );
    } finally {
      setImportingArmanId(null);
    }
  }

  const selectValue = value
    ? value
    : armanpvId
      ? `${ARMAN_PREFIX}${armanpvId}`
      : NONE;

  const selectedPdfUrl = useMemo(() => {
    if (value) {
      const found = items.find((i) => i.id === value);
      if (found?.source_url) return found.source_url;
      if (found?.armanpv_id) {
        const cat = armanCatalog.find((c) => c.id === found.armanpv_id);
        if (cat?.pdfUrl) return cat.pdfUrl;
      }
    }
    if (armanpvId) {
      const cat = armanCatalog.find((c) => c.id === armanpvId);
      if (cat?.pdfUrl) return cat.pdfUrl;
    }
    return null;
  }, [value, armanpvId, items, armanCatalog]);

  if (loading && items.length === 0 && armanCatalog.length === 0) {
    return (
      <div className="text-xs text-slate-500 flex items-center gap-1">
        <Loader2 className="w-3 h-3 animate-spin" />
        Загрузка учебников и каталога Арман-ПВ…
      </div>
    );
  }

  if (readyTextbooks.length === 0 && availableArmanCatalog.length === 0) {
    return (
      <div className="text-xs text-slate-500">
        Нет загруженных учебников.{" "}
        <Link href="/textbooks" className="text-sky-600 hover:underline">
          Каталог Арман-ПВ и загрузка PDF
        </Link>{" "}
        — AI будет цитировать учебник при генерации плана.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <BookOpen className="w-4 h-4 text-slate-400 shrink-0" />
        <Select
          value={selectValue}
          onValueChange={(v) => {
            setImportError(null);
            if (v === NONE) {
              onChange(null);
              onArmanPvChange?.(null);
              return;
            }
            if (v.startsWith(ARMAN_PREFIX)) {
              const catId = v.slice(ARMAN_PREFIX.length);
              onChange(null);
              void handleSelectArmanItem(catId);
              return;
            }
            onArmanPvChange?.(null);
            onChange(v);
          }}
        >
          <SelectTrigger className="h-9 text-sm max-w-[340px]">
            <SelectValue placeholder="Без учебника" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>— без учебника —</SelectItem>
            {readyTextbooks.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.armanpv_id ? "📗 " : ""}
                {t.title}
                {t.grade && !t.title.includes(`${t.grade} кл`) ? ` (${t.grade} кл.)` : ""}
              </SelectItem>
            ))}
            {availableArmanCatalog.map((c) => {
              const langTag =
                c.language === "kz"
                  ? "Қаз"
                  : c.language === "ru"
                    ? "Рус"
                    : c.language === "ug"
                      ? "Ұйғ"
                      : "O‘zb";
              return (
                <SelectItem key={c.id} value={`${ARMAN_PREFIX}${c.id}`}>
                  📚 {c.title} ({c.grade} кл., Арман-ПВ · {langTag}
                  {c.isGuide ? ", метод." : ""})
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {selectedPdfUrl && (
          <a
            href={selectedPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline whitespace-nowrap"
            title="Открыть официальный PDF учебника Арман-ПВ"
          >
            <ExternalLink className="w-3 h-3" />
            PDF
          </a>
        )}
        <Link href="/textbooks" className="text-xs text-sky-600 hover:underline whitespace-nowrap">
          Каталог Арман-ПВ
        </Link>
      </div>

      {!value && !armanpvId && !importingArmanId && recommendedArman && (
        <button
          type="button"
          onClick={() => {
            if (recommendedArman.type === "ready") {
              onChange(recommendedArman.textbook.id);
            } else {
              void handleSelectArmanItem(recommendedArman.item.id);
            }
          }}
          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100 transition-colors"
        >
          <Sparkles className="w-3 h-3 text-emerald-600" />
          Подключить учебник Арман-ПВ:{" "}
          {recommendedArman.type === "ready"
            ? recommendedArman.textbook.title
            : `${recommendedArman.item.title} (${recommendedArman.item.grade} кл.)`}
        </button>
      )}

      {importingArmanId && (
        <div className="flex items-center gap-1.5 text-xs text-sky-700" role="status">
          <Loader2 className="w-3 h-3 animate-spin" />
          Скачиваем и индексируем учебник с armanpv.com…
        </div>
      )}

      {importError && (
        <div className="text-xs text-amber-700 max-w-xs text-right">{importError}</div>
      )}
    </div>
  );
}
