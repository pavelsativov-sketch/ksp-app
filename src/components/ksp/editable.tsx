"use client";

import { useInlineEdit } from "./inline-edit-context";
import { RichTextRender } from "./rich-text-render";
import { RichTextEditor } from "./rich-text-editor";
import { Plus, Trash2 } from "lucide-react";

const INPUT_CLASS =
  "w-full border border-amber-300 rounded px-2 py-1 text-sm bg-amber-50/30 focus:outline-none focus:ring-2 focus:ring-amber-400";

/**
 * Editable single-line / multi-line text. Renders plain text when no
 * inline-edit provider is active or when `onChange` is not supplied.
 */
export function EditableText({
  value,
  onChange,
  multiline = false,
  placeholder = "—",
  className = "",
  rows,
}: {
  value: string;
  onChange?: (next: string) => void;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  rows?: number;
}) {
  const ctx = useInlineEdit();
  const editing = !!ctx?.enabled && !!onChange;

  if (!editing) {
    if (!value) {
      return <span className="text-slate-400 italic">{placeholder}</span>;
    }
    if (multiline) {
      return (
        <span className={`whitespace-pre-wrap ${className}`}>{value}</span>
      );
    }
    return <span className={className}>{value}</span>;
  }

  if (multiline) {
    const computedRows =
      rows ?? Math.min(12, Math.max(2, value.split("\n").length + 1));
    return (
      <textarea
        className={`${INPUT_CLASS} ${className}`}
        rows={computedRows}
        value={value}
        onChange={(e) => onChange!(e.target.value)}
        placeholder={placeholder}
      />
    );
  }
  return (
    <input
      type="text"
      className={`${INPUT_CLASS} ${className}`}
      value={value}
      onChange={(e) => onChange!(e.target.value)}
      placeholder={placeholder}
    />
  );
}

/**
 * Editable rich-text (HTML) — uses TipTap when editing, RichTextRender otherwise.
 * Used for stage.teacherActions / stage.studentActions.
 */
export function EditableRichText({
  value,
  onChange,
  placeholder,
  emptyText = "—",
  rows = 4,
}: {
  value: string;
  onChange?: (next: string) => void;
  placeholder?: string;
  emptyText?: string;
  rows?: number;
}) {
  const ctx = useInlineEdit();
  const editing = !!ctx?.enabled && !!onChange;

  if (!editing) {
    return <RichTextRender value={value} empty={emptyText} />;
  }

  return (
    <div className="border border-amber-300 rounded bg-amber-50/30 p-1">
      <RichTextEditor
        value={value}
        onChange={onChange!}
        placeholder={placeholder}
        rows={rows}
      />
    </div>
  );
}

/**
 * Editable bullet list of plain strings. Read-mode renders a <ul> (or the
 * `emptyContent` when items is empty). Edit-mode renders one input per item
 * + remove buttons + an "add" button.
 */
export function EditableList({
  items,
  onChange,
  placeholder = "Введите пункт",
  emptyContent,
  ordered = false,
}: {
  items: string[];
  onChange?: (next: string[]) => void;
  placeholder?: string;
  emptyContent?: React.ReactNode;
  ordered?: boolean;
}) {
  const ctx = useInlineEdit();
  const editing = !!ctx?.enabled && !!onChange;

  if (!editing) {
    if (items.length === 0) {
      return (
        emptyContent ?? <p className="text-slate-400 italic">—</p>
      ) as React.ReactElement;
    }
    const ListTag = ordered ? "ol" : "ul";
    return (
      <ListTag className={`${ordered ? "list-decimal" : "list-disc"} pl-6 space-y-1`}>
        {items.map((x, i) => (
          <li key={i}>{x || "—"}</li>
        ))}
      </ListTag>
    );
  }

  const update = (i: number, v: string) => {
    const next = items.slice();
    next[i] = v;
    onChange!(next);
  };
  const remove = (i: number) => {
    const next = items.slice();
    next.splice(i, 1);
    onChange!(next);
  };
  const add = () => onChange!([...items, ""]);

  return (
    <div className="space-y-1.5">
      {items.length === 0 && (
        <p className="text-xs text-slate-500 italic">Нет пунктов — добавьте через «＋».</p>
      )}
      {items.map((x, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <span className="font-mono text-xs text-slate-400 mt-1.5 w-6 shrink-0 text-right">
            {ordered ? `${i + 1}.` : "•"}
          </span>
          <input
            type="text"
            className={INPUT_CLASS}
            value={x}
            onChange={(e) => update(i, e.target.value)}
            placeholder={placeholder}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-slate-400 hover:text-red-600 mt-1.5 p-0.5"
            aria-label="Удалить пункт"
            title="Удалить пункт"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-xs text-amber-700 hover:text-amber-900 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-amber-100/60"
      >
        <Plus className="w-3.5 h-3.5" /> Добавить
      </button>
    </div>
  );
}
