"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import type { InteractiveTask } from "@/lib/ksp/tasks";
import type { LessonStage } from "@/lib/types/ksp";
import type { ReusableBlockKind, ReusableBlockProvenance, ReusableStageKey } from "@/lib/types/provenance";

type BlockSource = {
  planId: string;
  title: string;
  grade: number;
  language: "ru" | "kz";
  topic: string;
  objectiveCodes?: string[];
  stageKey?: ReusableStageKey;
};

export type PlanReuseBlock =
  | { id: string; kind: "stage"; source: BlockSource; preview: string; payload: LessonStage }
  | { id: string; kind: "task"; source: BlockSource; preview: string; payload: InteractiveTask }
  | { id: string; kind: "criterion"; source: BlockSource; preview: string; payload: string };

export function blockProvenance(block: PlanReuseBlock): ReusableBlockProvenance {
  return {
    sourcePlanId: block.source.planId,
    sourcePlanTitle: block.source.title,
    sourceGrade: block.source.grade,
    sourceLanguage: block.source.language,
    blockKind: block.kind,
    ...(block.source.stageKey ? { sourceStage: block.source.stageKey } : {}),
    copiedAt: new Date().toISOString(),
  };
}

export function PlanBlockPicker({
  kind,
  target,
  onUse,
}: {
  kind: ReusableBlockKind;
  target: { grade: number; language: "ru" | "kz"; objectiveCodes?: string[] };
  onUse: (block: PlanReuseBlock) => void;
}) {
  const { locale } = useUiLocale();
  const isKk = locale === "kk";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [blocks, setBlocks] = useState<PlanReuseBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const labels = {
    trigger: isKk ? "Өз КСП-ларымнан алу" : "Взять из моих КСП",
    panel: isKk ? "Өз жоспарларымнан блок таңдау" : "Выбрать блок из своих планов",
    search: isKk ? "Тақырып, тапсырма немесе КСП атауы бойынша іздеу" : "Поиск по теме, заданию или названию КСП",
    searchButton: isKk ? "Іздеу" : "Найти",
    loading: isKk ? "Ізделуде…" : "Ищем…",
    empty: isKk ? "Сәйкес блоктар табылмады." : "Подходящие блоки не найдены.",
    error: isKk ? "Блоктарды жүктеу мүмкін болмады. Қайталап көріңіз." : "Не удалось загрузить блоки. Попробуйте ещё раз.",
    use: isKk ? "Тәуелсіз көшірмені пайдалану" : "Использовать независимую копию",
    preview: isKk ? "Алдын ала қарау" : "Предпросмотр",
    own: isKk ? "Тек өз жоспарларыңыз көрсетіледі." : "Показываются только ваши собственные планы.",
    gradeMismatch: isKk ? "Бастапқы жоспар басқа сыныпқа арналған." : "Источник подготовлен для другого класса.",
    languageMismatch: isKk ? "Бастапқы жоспардың тілі басқа." : "Язык исходного плана отличается.",
    objectiveMismatch: isKk ? "Тапсырманың оқу мақсаты ағымдағы КСП мақсаттарымен сәйкес келмеуі мүмкін." : "Цель задания может не совпадать с целями текущего КСП.",
  };

  async function loadBlocks(searchText = query) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ kind, q: searchText });
      const response = await fetch(`/api/plans/reuse?${params.toString()}`);
      const body = await response.json() as { blocks?: unknown; error?: string };
      if (!response.ok || !Array.isArray(body.blocks)) throw new Error(body.error || labels.error);
      setBlocks(body.blocks as PlanReuseBlock[]);
      setSearched(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : labels.error);
    } finally {
      setLoading(false);
    }
  }

  function warnings(block: PlanReuseBlock): string[] {
    const messages: string[] = [];
    if (block.source.grade !== target.grade) messages.push(labels.gradeMismatch);
    if (block.source.language !== target.language) messages.push(labels.languageMismatch);
    const destinationCodes = target.objectiveCodes ?? [];
    const sourceCodes = block.kind === "task" && block.payload.objectiveCode
      ? [block.payload.objectiveCode]
      : block.source.objectiveCodes ?? [];
    if (sourceCodes.length > 0 && (!destinationCodes.length || !sourceCodes.some((code) => destinationCodes.includes(code)))) {
      messages.push(labels.objectiveMismatch);
    }
    return messages;
  }

  const kindName = kind === "stage" ? (isKk ? "кезең" : "этап") : kind === "task" ? (isKk ? "тапсырма" : "задание") : (isKk ? "бағалау критерийі" : "критерий оценивания");

  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" size="sm" aria-expanded={open} onClick={() => {
        const next = !open;
        setOpen(next);
        if (next && !searched) void loadBlocks("");
      }}>
        {labels.trigger}
      </Button>
      {open && (
        <section className="space-y-3 rounded-xl border border-[#cfc3b5] bg-[#f8f4ed] p-4" aria-label={`${labels.panel}: ${kindName}`}>
          <div>
            <h4 className="text-sm font-semibold">{labels.panel}: {kindName}</h4>
            <p className="mt-1 text-xs text-[#756b63]">{labels.own}</p>
          </div>
          <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void loadBlocks(); }}>
            <label className="sr-only" htmlFor={`reuse-search-${kind}`}>{labels.search}</label>
            <input
              id={`reuse-search-${kind}`}
              className="min-w-0 flex-1 rounded-lg border border-[#cfc3b5] bg-white px-3 py-2 text-sm"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={labels.search}
              maxLength={120}
            />
            <Button type="submit" size="sm" variant="outline" disabled={loading}>{loading ? labels.loading : labels.searchButton}</Button>
          </form>
          {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
          {searched && !loading && blocks.length === 0 && !error && <p className="text-xs text-[#756b63]">{labels.empty}</p>}
          <div className="max-h-[30rem] space-y-3 overflow-y-auto">
            {blocks.map((block) => {
              const mismatch = warnings(block);
              return (
                <article key={block.id} className="space-y-2 rounded-lg border border-[#ddd5cb] bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h5 className="text-sm font-semibold">{block.source.title}</h5>
                      <p className="text-xs text-[#756b63]">{block.source.topic || (isKk ? "Тақырып көрсетілмеген" : "Тема не указана")} · {block.source.grade} {isKk ? "сынып" : "класс"} · {block.source.language.toUpperCase()}{block.source.stageKey ? ` · ${block.source.stageKey}` : ""}</p>
                    </div>
                  </div>
                  <details>
                    <summary className="cursor-pointer text-xs font-medium">{labels.preview}</summary>
                    <p className="mt-2 whitespace-pre-wrap text-xs text-[#453d36]">{block.preview}</p>
                    {block.kind === "stage" && <p className="mt-1 text-xs text-[#756b63]">{isKk ? `Тапсырмалар: ${block.payload.tasks?.length ?? 0}` : `Заданий: ${block.payload.tasks?.length ?? 0}`}</p>}
                    {block.kind === "task" && block.payload.objectiveCode && <p className="mt-1 text-xs text-[#756b63]">{isKk ? "Оқу мақсаты" : "Цель обучения"}: {block.payload.objectiveCode}</p>}
                  </details>
                  {mismatch.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs text-amber-800" aria-label={isKk ? "Сәйкессіздік ескертулері" : "Предупреждения о несовпадении"}>{mismatch.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
                  <Button type="button" size="sm" onClick={() => { onUse(block); setOpen(false); }}>{labels.use}</Button>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
