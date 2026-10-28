'use client';

import React, { useCallback, useEffect, useRef, useState } from "react";
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
  ps1: "powershell", xml: "xml", sql: "sql", csv: "plaintext", txt: "plaintext",
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
  const [files, setFiles] = useState<string[]>([]);
  // Экземпляр Monaco и актуальная функция сохранения лежат в ref: команда
  // Ctrl+S регистрируется один раз при монтировании, и замыкание на `save`
  // из того рендера видело бы пустой редактор — сохранение молча не работало.
  const editorInstance = useRef<{ getValue: () => string } | null>(null);
  const saveRef = useRef<() => void>(() => {});
  const openRef = useRef<OpenFile | null>(null);

  useEffect(() => { openRef.current = open; }, [open]);

  const refreshFiles = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/sandbox", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { files?: { name: string }[] };
      setFiles((data.files ?? []).map((f) => f.name));
    } catch {
      // список файлов — удобство, а не необходимость
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void refreshFiles(), 0);
    return () => clearTimeout(timer);
  }, [refreshFiles]);

  const openFile = useCallback(async (name: string) => {
    const current = openRef.current;
    if (current?.dirty && current.name !== name && !window.confirm(`В «${current.name}» есть несохранённые изменения. Открыть «${name}» без сохранения?`)) {
      return;
    }
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
    const editor = editorInstance.current;
    if (!open || !editor || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const content = editor.getValue();
      const res = await fetch("/api/agents/sandbox", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: open.name, content }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Не удалось сохранить");
      }
      setOpen({ ...open, dirty: false, content });
      setNotice("Сохранено");
      void refreshFiles();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Ошибка сохранения");
    }
    setSaving(false);
  }, [open, saving, refreshFiles]);

  useEffect(() => { saveRef.current = () => { void save(); }; }, [save]);

  const onMount: OnMount = (editor, monaco: Monaco) => {
    editorInstance.current = editor;
    // Ctrl+S — сохранить файл; вызываем актуальную версию через ref.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => { saveRef.current(); });
  };

  const ext = open?.name.split(".").pop()?.toLowerCase() ?? "txt";
  const names = open && !files.includes(open.name) ? [open.name, ...files] : files;

  function createFile() {
    const current = openRef.current;
    if (current?.dirty && !window.confirm(`В «${current.name}» есть несохранённые изменения. Создать новый файл без сохранения?`)) return;
    const name = window.prompt("Имя нового файла:", "script.js");
    if (!name) return;
    setOpen({ name, content: "", dirty: true });
    setNotice("Введите содержимое и нажмите «Сохранить» (Ctrl+S)");
  }

  return (
    <div className="flex h-full flex-col bg-[#141225] text-slate-200">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-1.5">
        <FileCode className="size-3.5 shrink-0 text-sky-300" />
        {names.length > 0 ? (
          <select
            aria-label="Файл в редакторе"
            value={open?.name ?? ""}
            onChange={(e) => { if (e.target.value) void openFile(e.target.value); }}
            className="min-w-0 max-w-[55%] flex-1 truncate rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-slate-200 outline-none focus:border-sky-400/50"
          >
            {!open && <option value="">Выберите файл…</option>}
            {names.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        ) : (
          <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{open ? open.name : "нет открытого файла"}</span>
        )}
        <span className="flex-1" />
        {open?.dirty && <span className="shrink-0 text-[10px] text-amber-400">не сохранено</span>}
        <button
          type="button"
          onClick={createFile}
          title="Новый файл"
          aria-label="Новый файл"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-white/15 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-white/10"
        >
          <FilePlus className="size-3" /> <span className="hidden sm:inline">Новый</span>
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!open || saving}
          title="Сохранить (Ctrl+S)"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-500/40 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"
        >
          {saving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />} Сохранить
        </button>
      </div>

      {notice && <p className="shrink-0 px-3 py-1 text-[11px] text-muted-foreground" role="status">{notice}</p>}

      {loading && <p className="flex flex-1 items-center justify-center gap-2 text-sm text-white/40"><Loader2 className="size-4 animate-spin" /> Открываю…</p>}

      {!open && !loading && (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-white/40">
          {files.length > 0
            ? "Выберите файл в списке сверху, откройте его из вкладки «Файлы» (кнопка «В редактор») или создайте новый."
            : "Файлов пока нет. Создайте новый — или дождитесь, пока агент создаст файлы."}
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
            options={{ fontSize: 13, minimap: { enabled: false }, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2, wordWrap: "on" }}
            loading={<p className="flex h-full items-center justify-center text-sm text-white/40"><Loader2 className="size-4 animate-spin" /> Загрузка редактора…</p>}
          />
        </div>
      )}
    </div>
  );
}
