'use client';

import React, { useCallback, useEffect, useState } from "react";
import Editor, { type OnMount, type Monaco } from "@monaco-editor/react";
import { FileCode, Loader2, Save, FilePlus } from "lucide-react";
import { useActiveAgentTask } from "@/components/agents/agent-dock";

interface OpenFile {
  name: string;
  content: string;
  dirty: boolean;
}

const LANG: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  json: "json", css: "css", html: "html", md: "markdown", py: "python",
  sh: "shell", bat: "bat", cmd: "bat", yml: "yaml", yaml: "yaml",
};

/**
 * Настоящий редактор кода (Monaco) над файлами рабочей машины:
 * открытие из файл-менеджера, правка, сохранение на диск через API.
 */
export function CodeEditorApp({ requestedFile }: { requestedFile?: string | null }) {
  const task = useActiveAgentTask();
  const [open, setOpen] = useState<OpenFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editorRef, setEditorRef] = useState<{ getValue: () => string; setValue: (v: string) => void } | null>(null);

  const openFile = useCallback(async (name: string) => {
    if (!task) return;
    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/agents/sandbox?taskId=${task.id}&file=${encodeURIComponent(name)}`, { cache: "no-store" });
      const data = (await res.json()) as { content?: string; error?: string };
      if (!res.ok || data.content === undefined) throw new Error(data.error ?? "Не удалось открыть");
      setOpen({ name, content: data.content, dirty: false });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Ошибка открытия");
      setOpen(null);
    }
    setLoading(false);
  }, [task]);

  // Файл, запрошенный из файл-менеджера («Открыть в редакторе»).
  useEffect(() => {
    if (requestedFile && task) void openFile(requestedFile);
  }, [requestedFile, task, openFile]);

  const save = useCallback(async () => {
    if (!task || !open || !editorRef || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/agents/sandbox", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: open.name, content: editorRef.getValue() }),
      });
      if (!res.ok) throw new Error("Не удалось сохранить");
      setOpen({ ...open, dirty: false, content: editorRef.getValue() });
      setNotice("Сохранено на диск");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Ошибка сохранения");
    }
    setSaving(false);
  }, [task, open, editorRef, saving]);

  const onMount: OnMount = (editor, monaco: Monaco) => {
    setEditorRef({ getValue: () => editor.getValue(), setValue: (v: string) => editor.setValue(v) });
    // Ctrl+S — сохранить файл в машину.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => { void save(); });
  };

  if (!task) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-white/45">
        <div className="max-w-xs space-y-2">
          <FileCode className="mx-auto size-8 text-white/25" />
          <p>Редактор работает с файлами машины. Запустите задачу или создайте файл в терминале.</p>
        </div>
      </div>
    );
  }

  const ext = open?.name.split(".").pop()?.toLowerCase() ?? "txt";

  return (
    <div className="flex h-full flex-col bg-[#141225] text-slate-200">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-1.5">
        <FileCode className="size-3.5 text-sky-300" />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{open ? open.name : "нет открытого файла"}</span>
        {open?.dirty && <span className="text-[10px] text-amber-400">не сохранено</span>}
        <button
          type="button"
          onClick={() => void save()}
          disabled={!open || saving}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"
        >
          {saving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />} Сохранить
        </button>
      </div>

      {notice && <p className="shrink-0 px-3 py-1 text-[11px] text-muted-foreground">{notice}</p>}

      {loading && <p className="flex flex-1 items-center justify-center gap-2 text-sm text-white/40"><Loader2 className="size-4 animate-spin" /> Открываю…</p>}

      {!open && !loading && (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-white/40">
          Откройте файл из вкладки «Файлы» (кнопка «В редактор») или создайте новый.
          <button
            type="button"
            className="ml-2 inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10"
            onClick={() => { const name = window.prompt("Имя нового файла:", "script.js"); if (name) { setOpen({ name, content: "", dirty: true }); setNotice("Введите содержимое и нажмите «Сохранить»"); } }}
          >
            <FilePlus className="size-3" /> Новый файл
          </button>
        </div>
      )}

      {open && !loading && (
        <div className="min-h-0 flex-1">
          <Editor
            height="100%"
            theme="vs-dark"
            language={LANG[ext] ?? "plaintext"}
            value={open.content}
            onMount={onMount}
            onChange={(v) => setOpen((o) => (o ? { ...o, content: v ?? "", dirty: true } : o))}
            options={{ fontSize: 13, minimap: { enabled: true }, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2 }}
            loading={<p className="flex h-full items-center justify-center text-sm text-white/40"><Loader2 className="size-4 animate-spin" /> Загрузка редактора…</p>}
          />
        </div>
      )}
    </div>
  );
}
