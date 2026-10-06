"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Grid3x3, Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { FlashcardSet, Handout, Worksheet } from "@/lib/handouts/types";
import { HandoutPreview } from "./handout-preview";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import type { Dict } from "@/lib/i18n/dictionaries";

type Kind = "worksheet" | "flashcards" | "crossword";

const KIND_STATIC: Record<
  Kind,
  {
    counts: number[];
    defaultCount: number;
    icon: React.ComponentType<{ className?: string }>;
    withImages: boolean;
  }
> = {
  worksheet: { counts: [5, 6, 7, 8], defaultCount: 6, icon: FileText, withImages: true },
  flashcards: { counts: [8, 12, 16, 20], defaultCount: 12, icon: Layers, withImages: true },
  crossword: { counts: [6, 8, 10], defaultCount: 8, icon: Grid3x3, withImages: false },
};

type KindDictKey = "worksheet" | "flashcards" | "crossword";

function kindMeta(t: Dict, kind: Kind) {
  const d = t.handouts.kinds[kind as KindDictKey];
  return { ...KIND_STATIC[kind], label: d.label, description: d.description, countNoun: d.countNoun };
}

interface KSPContext {
  learningObjectives: string[];
  assessmentCriteria: string[];
  stages: { stage: string; activities: string }[];
}

interface BaseProps {
  planId: string;
  topic: string;
  subject: string;
  grade: number;
  language: "ru" | "kz";
  kspContext?: KSPContext;
}

type PreviewState = {
  handout: Handout;
  extra?: Handout;
  title?: string;
  fileName?: string;
  docxBase64?: string;
};

/** Разбор строк «слово — подсказка» в пары для кроссворда. */
export function parseCrosswordLines(text: string): Array<{ word: string; clue: string }> {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.+?)\s*[—–\-:]\s*(.+)$/);
      if (!m) return null;
      return { word: m[1].trim(), clue: m[2].trim() };
    })
    .filter((p): p is { word: string; clue: string } => p !== null && p.word.length > 0 && p.clue.length > 0);
}

function loadCache(key: string): PreviewState | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as PreviewState) : null;
  } catch {
    return null;
  }
}

function saveCache(key: string, value: PreviewState) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // переполнение квоты — некритично
  }
}

/** Кнопки-пилюли выбора количества вместо числового инпута. */
function CountPills({
  options,
  value,
  onChange,
  noun,
  howMany,
}: {
  options: number[];
  value: number;
  onChange: (n: number) => void;
  noun: string;
  howMany: string;
}) {
  return (
    <div>
      <Label>{howMany} {noun}?</Label>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-pressed={value === n}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              value === n
                ? "bg-[#2B2D83] text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Компактный переключатель вместо длинного чекбокса с техническим текстом. */
function ImagesSwitch({
  checked,
  onChange,
  disabled,
  title,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  title: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
      <span>
        <span className="font-medium">{title}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-[#2B2D83]" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-all ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </label>
  );
}

/**
 * Отдельная кнопка создания одного вида материала.
 * kind=worksheet|flashcards — с опцией «объединить» (комплект в один документ).
 */
function MaterialButton({ kind, ...base }: BaseProps & { kind: Kind }) {
  const { t } = useUiLocale();
  const h = t.handouts;
  const meta = kindMeta(t, kind);
  const Icon = meta.icon;
  const cacheKey = `handout:${kind}:${base.planId}`;

  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(meta.defaultCount);
  const [withImages, setWithImages] = useState(false);
  const [combine, setCombine] = useState(false);
  const [secondCount, setSecondCount] = useState(
    kind === "worksheet" ? KIND_STATIC.flashcards.defaultCount : KIND_STATIC.worksheet.defaultCount,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [cached, setCached] = useState<PreviewState | null>(null);
  // Кроссворд: режим AI-подбора или свои слова («слово — подсказка» построчно).
  const [cwMode, setCwMode] = useState<"ai" | "custom">("ai");
  const [cwText, setCwText] = useState("");
  const popRef = useRef<HTMLDivElement | null>(null);

  // Кэш привязан к уроку: при смене плана подхватываем заново при рендере.
  const [cachedKeySeen, setCachedKeySeen] = useState(cacheKey);
  if (cachedKeySeen !== cacheKey) {
    setCachedKeySeen(cacheKey);
    setCached(loadCache(cacheKey));
  }

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open ]);

  const canCombine = kind === "worksheet" || kind === "flashcards";

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      if (combine && canCombine) {
        const res = await fetch("/api/handouts/combined", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: base.topic,
            subject: base.subject,
            grade: base.grade,
            language: base.language,
            worksheetCount: kind === "worksheet" ? count : secondCount,
            memosCount: kind === "flashcards" ? count : secondCount,
            withImages: withImages || undefined,
            kspContext: base.kspContext,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.worksheet || !data?.memos) {
          throw new Error(data?.error || h.genErr);
        }
        const next: PreviewState = {
          handout: data.worksheet as Worksheet,
          extra: data.memos as FlashcardSet,
          title: "Рабочий лист + Памятки",
          fileName: `Рабочий лист + Памятки — ${base.topic}.docx`,
          docxBase64: data.docxBase64,
        };
        setPreview(next);
        setCached(next);
        saveCache(`handout:combined:${base.planId}`, next);
      } else {
        const customWords = kind === "crossword" && cwMode === "custom"
          ? parseCrosswordLines(cwText)
          : undefined;
        if (kind === "crossword" && cwMode === "custom" && (!customWords || customWords.length < 3)) {
          throw new Error(h.cwNeedMore);
        }
        const res = await fetch("/api/handouts/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            topic: base.topic,
            subject: base.subject,
            grade: base.grade,
            language: base.language,
            count,
            withImages: meta.withImages ? withImages || undefined : undefined,
            kspContext: base.kspContext,
            customWords: customWords && customWords.length ? customWords : undefined,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.handout) {
          throw new Error(data?.error || h.genErr);
        }
        const next: PreviewState = {
          handout: data.handout as Handout,
          title: meta.label,
          fileName: `${meta.label} — ${base.topic}.docx`,
          docxBase64: data.docxBase64,
        };
        setPreview(next);
        setCached(next);
        saveCache(cacheKey, next);
      }
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка генерации");
    } finally {
      setLoading(false);
    }
  }

  const secondMeta = kind === "worksheet" ? kindMeta(t, "flashcards") : kindMeta(t, "worksheet");

  return (
    <div className="relative" ref={popRef}>
      {preview && (
        <HandoutPreview
          handout={preview.handout}
          extra={preview.extra}
          title={preview.title}
          fileName={preview.fileName}
          docxBase64={preview.docxBase64}
          onClose={() => setPreview(null)}
          meta={{ topic: base.topic, subject: base.subject, grade: base.grade, language: base.language }}
        />
      )}
      <Button variant="outline" onClick={() => setOpen((v) => !v)} disabled={!base.topic}>
        <Icon />
        {meta.label}
      </Button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border border-slate-200 bg-surface p-4 shadow-lg">
          <div className="mb-3 flex items-center gap-2">
            <Icon className="h-5 w-5 text-[#2B2D83]" />
            <div>
              <div className="text-sm font-bold">{meta.label}</div>
              <div className="text-xs text-slate-500">{meta.description}</div>
            </div>
          </div>

          {cached && (
            <button
              type="button"
              onClick={() => {
                setPreview(cached);
                setOpen(false);
              }}
              className="mb-3 w-full rounded-md border border-sky-200 bg-sky-50/60 p-2 text-left text-sm hover:bg-sky-50"
            >
              <span className="font-medium text-sky-800">{h.openSaved}</span>
              <span className="block text-xs text-sky-600/80">{h.openSavedHint}</span>
            </button>
          )}

          <div className="space-y-3">
            <div className="text-xs text-slate-600">
              {h.topic}: <span className="font-medium">{base.topic}</span>
              <br />
              {base.grade} {h.gradeWord} · {base.subject}
            </div>

            <CountPills options={meta.counts} value={count} onChange={setCount} noun={meta.countNoun} howMany={h.howMany} />

            {kind === "crossword" && (
              <div className="space-y-2">
                <div className="flex gap-1.5">
                  {(["ai", "custom"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setCwMode(m)}
                      aria-pressed={cwMode === m}
                      className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium ${cwMode === m ? "bg-[#2B2D83] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                    >
                      {m === "ai" ? h.cwAi : h.cwCustom}
                    </button>
                  ))}
                </div>
                {cwMode === "custom" && (
                  <div>
                    <textarea
                      value={cwText}
                      onChange={(e) => setCwText(e.target.value)}
                      rows={5}
                      maxLength={4000}
                      placeholder={h.cwPlaceholder}
                      className="w-full rounded-md border border-slate-300 p-2 text-xs"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      {h.cwParsed}: {parseCrosswordLines(cwText).length} {h.cwNeed}
                    </p>
                  </div>
                )}
              </div>
            )}

            {meta.withImages && (
              <ImagesSwitch checked={withImages} onChange={setWithImages} disabled={loading} title={h.images} hint={h.imagesHint} />
            )}

            {canCombine && (
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md bg-indigo-50/60 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{kind === "worksheet" ? h.combineWorksheet : h.combineFlashcards}</span>
                  <span className="block text-xs text-slate-500">{h.combineHint}</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={combine}
                  disabled={loading}
                  onClick={() => setCombine((v) => !v)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    combine ? "bg-[#2B2D83]" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-all ${
                      combine ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </label>
            )}

            {combine && canCombine && (
              <CountPills
                options={secondMeta.counts}
                value={secondCount}
                onChange={setSecondCount}
                noun={secondMeta.countNoun}
                howMany={h.howMany}
              />
            )}

            {error && <div className="text-xs text-red-600">{error}</div>}

            <Button type="button" onClick={generate} disabled={loading} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="animate-spin" />
                  {h.generating}
                </>
              ) : combine && canCombine ? (
                <>{h.createBundle}</>
              ) : (
                <>{h.create}</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function WorksheetButton(props: BaseProps) {
  return <MaterialButton kind="worksheet" {...props} />;
}

export function MemosButton(props: BaseProps) {
  return <MaterialButton kind="flashcards" {...props} />;
}

export function CrosswordButton(props: BaseProps) {
  return <MaterialButton kind="crossword" {...props} />;
}
