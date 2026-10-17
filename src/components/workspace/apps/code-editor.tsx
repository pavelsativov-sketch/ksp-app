'use client';

import React, { useCallback, useEffect, useState } from "react";
import Editor, { loader, type OnMount, type Monaco } from "@monaco-editor/react";
import { FileCode, Loader2, Save, FilePlus } from "lucide-react";
import { useWorkspaceStore } from "@/lib/store/workspace";

/**
 * Monaco раздаём сами, из public/monaco/vs (копия делается скриптом
 * copy-monaco.mjs при установке и перед сборкой).
 *
 * Раньше редактор тянулся с jsdelivr, и в школах с ограниченным интернетом
 * вкладка «Редактор» не открывалась вовсе. Путь указываем до любой отрисовки
 * редактора: загрузчик AMD читает его в момент первого mount.
 */
loader.config({ paths: { vs: "/monaco/vs" } });

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
 * Редактор Monaco над персональными файлами рабочей области:
 * открытие из файл-менеджера, правка, сохранение на диск через API.
 */
export function CodeEditorApp({ requestedFile }: { requestedFile?: string | null }) {
  // Без явного аргумента редактор берёт файл из окна рабочей области. Так его
  // можно открыть иконкой на рабочем столе, и кнопкой «В редактор» из
  // файлового менеджера — раньше он открывался только вторым способом и только
  // в двухпанельной раскладке.
  const windowFile = useWorkspaceStore((s) => s.windows.find((w) => w.type === "code-editor")?.file);
  const effectiveFile = requestedFile ?? windowFile ?? null;
  const [open, setOpen] = useState<OpenFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editorRef, setEditorRef] = useState<{ getValue: () => string; setValue: (v: string) => void } | null>(null);

  const openFile = useCallback(async (name: string) => {
    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/agents/sandbox?file=${encodeURIComponent(name)}`, { cache: "no-store" });
      const data = (await res.json()) as { content?: string; error?: string };
      if (!res.ok || data.content === undefined) throw new Error(data.error ?? "Не удалось открыть");
      setOpen({ name, content: data.content, dirty: false });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Ошибка открытия");
      setOpen(null);
    }
    setLoading(false);
  }, []);

  // Файл, запрошенный из файл-менеджера («Открыть в редакторе»).
  //
  // Загрузка начинается с отдельной задачи, а не прямо в эффекте: openFile
  // сразу ставит setLoading(true), и синхронный setState внутри эффекта
  // запускает каскадный рендер — редактор мигал и мог открыть файл дважды
  // при быстрых кликах.
  useEffect(() => {
    if (!effectiveFile) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void openFile(effectiveFile);
    });
    return () => {
      cancelled = true;
    };
  }, [effectiveFile, openFile]);

  const save = useCallback(async () => {
    if (!open || !editorRef || saving) return;
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
  }, [open, editorRef, saving]);

  const onMount: OnMount = (editor, monaco: Monaco) => {
    setEditorRef({ getValue: () => editor.getValue(), setValue: (v: string) => editor.setValue(v) });
    // Ctrl+S — сохранить файл в машину.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => { void save(); });
  };

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
