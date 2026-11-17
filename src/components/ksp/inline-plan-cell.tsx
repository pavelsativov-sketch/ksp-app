"use client";

import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AiEnhanceButton, type EnhanceSection, type EnhanceStage } from "./ai-enhance-button";
import { MathText } from "@/lib/math/render-math";

interface EnhanceCtx {
  topic: string;
  subject: string;
  grade: number;
  language: "ru" | "kz";
}

export function InlineTextCell({
  value,
  editable,
  multiline = true,
  placeholder,
  onCommit,
  enhanceSection,
  enhanceStage,
  enhanceContext,
  language = "ru",
}: {
  value: string;
  editable?: boolean;
  multiline?: boolean;
  placeholder?: string;
  onCommit: (next: string) => void;
  enhanceSection?: EnhanceSection;
  enhanceStage?: EnhanceStage;
  enhanceContext?: EnhanceCtx;
  language?: "ru" | "kz";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editable) {
    return value ? <MathText text={value} /> : <span className="text-muted-foreground">—</span>;
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        title={language === "kz" ? "Өңдеу үшін басыңыз" : "Нажмите, чтобы изменить прямо в таблице"}
        className="group relative -mx-1.5 -my-1 inline-flex w-[calc(100%+0.75rem)] items-start justify-between gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
          {value ? (
            <MathText text={value} />
          ) : (
            <span className="italic text-muted-foreground">
              {placeholder ?? (language === "kz" ? "Толтыру үшін басыңыз…" : "Нажмите, чтобы заполнить…")}
            </span>
          )}
        </span>
        <Pencil
          aria-hidden="true"
          className="no-print mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
        />
      </button>
    );
  }

  const commit = () => {
    setEditing(false);
    if (draft !== value) onCommit(draft);
  };

  return (
    <div className="no-print space-y-2 rounded-xl border border-primary/40 bg-background p-2.5 shadow-sm">
      {multiline ? (
        <Textarea
          autoFocus
          rows={Math.min(10, Math.max(3, draft.split("\n").length + 1))}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
          className="text-sm"
        />
      ) : (
        <Input
          autoFocus
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
          className="text-sm"
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button type="button" size="sm" onClick={commit}>
            <Check className="size-3.5" />
            {language === "kz" ? "Қолдану" : "Применить"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            <X className="size-3.5" />
            {language === "kz" ? "Болдырмау" : "Отмена"}
          </Button>
        </div>
        {enhanceSection && enhanceContext && (
          <AiEnhanceButton
            section={enhanceSection}
            stage={enhanceStage}
            current={draft}
            context={enhanceContext}
            label={language === "kz" ? "ЖИ арқылы жақсарту" : "Улучшить ИИ"}
            onApply={(improved) => {
              const next = Array.isArray(improved) ? improved.join("\n") : String(improved);
              setDraft(next);
            }}
          />
        )}
      </div>
    </div>
  );
}

export function InlineListCell({
  items,
  editable,
  placeholder,
  onCommit,
  enhanceSection,
  enhanceStage,
  enhanceContext,
  language = "ru",
}: {
  items: string[];
  editable?: boolean;
  placeholder?: string;
  onCommit: (next: string[]) => void;
  enhanceSection?: EnhanceSection;
  enhanceStage?: EnhanceStage;
  enhanceContext?: EnhanceCtx;
  language?: "ru" | "kz";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => items.join("\n"));

  const parseLines = (raw: string) =>
    raw
      .split(/\r?\n/)
      .map((s) => s.replace(/^\s*[-•*]\s*/, "").trim())
      .filter(Boolean);

  if (!editable) {
    if (items.length === 0) return <p className="italic text-muted-foreground">—</p>;
    return (
      <ul className="list-disc space-y-1 pl-6">
        {items.map((x, i) => (
          <li key={`${x.slice(0, 24)}_${i}`}>
            <MathText text={x} />
          </li>
        ))}
      </ul>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(items.join("\n"));
          setEditing(true);
        }}
        title={language === "kz" ? "Тізімді өңдеу үшін басыңыз" : "Нажмите, чтобы изменить список"}
        className="group relative -mx-1.5 -my-1 flex w-[calc(100%+0.75rem)] items-start justify-between gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <div className="min-w-0 flex-1">
          {items.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5">
              {items.map((x, i) => (
                <li key={`${x.slice(0, 24)}_${i}`}>
                  <MathText text={x} />
                </li>
              ))}
            </ul>
          ) : (
            <span className="italic text-muted-foreground">
              {placeholder ?? (language === "kz" ? "Әр жолға бір тармақтан қосыңыз…" : "Нажмите, чтобы добавить пункты…")}
            </span>
          )}
        </div>
        <Pencil
          aria-hidden="true"
          className="no-print mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
        />
      </button>
    );
  }

  const commit = () => {
    setEditing(false);
    const next = parseLines(draft);
    if (JSON.stringify(next) !== JSON.stringify(items)) {
      onCommit(next);
    }
  };

  return (
    <div className="no-print space-y-2 rounded-xl border border-primary/40 bg-background p-2.5 shadow-sm">
      <Textarea
        autoFocus
        rows={Math.min(10, Math.max(3, items.length + 1))}
        value={draft}
        placeholder={
          placeholder ??
          (language === "kz" ? "Әр тармақты жаңа жолдан жазыңыз" : "Каждый пункт — с новой строки")
        }
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
        }}
        className="text-sm"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button type="button" size="sm" onClick={commit}>
            <Check className="size-3.5" />
            {language === "kz" ? "Қолдану" : "Применить"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            <X className="size-3.5" />
            {language === "kz" ? "Болдырмау" : "Отмена"}
          </Button>
        </div>
        {enhanceSection && enhanceContext && (
          <AiEnhanceButton
            section={enhanceSection}
            stage={enhanceStage}
            current={parseLines(draft)}
            context={enhanceContext}
            label={language === "kz" ? "ЖИ арқылы жақсарту" : "Улучшить ИИ"}
            onApply={(improved) => {
              const list = Array.isArray(improved) ? improved : [String(improved)];
              setDraft(list.join("\n"));
            }}
          />
        )}
      </div>
    </div>
  );
}
