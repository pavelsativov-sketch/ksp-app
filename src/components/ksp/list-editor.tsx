"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ListEditorProps {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}

export function ListEditor({ items, onChange, placeholder }: ListEditorProps) {
  const [draft, setDraft] = useState("");
  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {items.map((item, idx) => (
          <li
            key={idx}
            className="flex items-start gap-2 bg-slate-50 rounded px-2 py-1"
          >
            <span className="text-slate-400 text-xs mt-1">•</span>
            <span className="flex-1 text-sm whitespace-pre-wrap">{item}</span>
            <button
              type="button"
              className="text-slate-400 hover:text-red-600"
              onClick={() => onChange(items.filter((_, i) => i !== idx))}
              aria-label="Удалить"
            >
              <X className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              e.preventDefault();
              onChange([...items, draft.trim()]);
              setDraft("");
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (draft.trim()) {
              onChange([...items, draft.trim()]);
              setDraft("");
            }
          }}
        >
          <Plus /> Добавить
        </Button>
      </div>
    </div>
  );
}
