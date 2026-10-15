'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileText, Image as ImageIcon, Music, Film, Archive, Code,
  LayoutGrid, List, RefreshCw, File, Loader2, Terminal, Upload, Pencil,
} from 'lucide-react';
import { useWorkspaceStore } from '@/lib/store/workspace';

interface FsItem {
  name: string;
  size: number;
  sizeLabel: string;
  modified: string;
}

/** Ограничение рабочего файла на сервере: файлов больше не принять. */
const MAX_FILE_BYTES = 200_000;
/** Загрузка отдыхает только на текстовых форматах: бинарник в UTF-8-хранилище
 *  приводит к повреждённому файлу, предупреждаем честно, а не портим данные. */
const TEXT_EXTENSIONS = ['txt', 'md', 'csv', 'json', 'py', 'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'xml', 'yml', 'yaml', 'svg', 'ini', 'cfg', 'log'];
const ACCEPT = TEXT_EXTENSIONS.map((ext) => `.${ext}`).join(',');

/**
 * Файловый менеджер показывает содержимое личного изолированного workspace.
 */
export function FileManagerApp() {
  // Открытие файла в редакторе идёт через хранилище рабочей области.
  // Раньше кнопка «В редактор» отправляла событие window, на которое
  // подписывалась только двухпанельная раскладка /school. На
  // полноэкранной /school/workspace подписчика не было — кнопка выглядела
  // рабочей и молча ничего не делала.
  const openInEditor = useWorkspaceStore((s) => s.openInEditor);
  const [files, setFiles] = useState<FsItem[] | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('list');
  const [selected, setSelected] = useState<{ name: string; content: string; truncated: boolean } | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyOp, setBusyOp] = useState<'upload' | 'rename' | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setFiles(null);
    setError(null);
    try {
      const res = await fetch('/api/agents/sandbox', { cache: 'no-store' });
      if (!res.ok) throw new Error('load failed');
      const data = (await res.json()) as { files: FsItem[] };
      setFiles(data.files ?? []);
    } catch {
      setError('Не удалось прочитать песочницу');
      setFiles([]);
    }
  }, []);

  useEffect(() => {
    // Загрузка — асинхронная операция, поэтому первый setState происходит
    // уже после await, а не синхронно в теле эффекта. Раньше эффект был
    // записан как `() => load()`, и линтер react-hooks справедливо
    // предупреждал о каскадном рендере.
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  /** Загрузка педагогом своих файлов: текстовые до 200 КБ, как и на API. */
  async function uploadFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusyOp('upload');
    setNotice(null);
    const results: string[] = [];
    for (const file of Array.from(list)) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (file.size === 0) { results.push(`${file.name}: пустой файл`); continue; }
      if (file.size > MAX_FILE_BYTES) { results.push(`${file.name}: больше 200 КБ`); continue; }
      if (!TEXT_EXTENSIONS.includes(ext)) { results.push(`${file.name}: только текстовые форматы`); continue; }
      if (files?.some((existing) => existing.name === file.name)
        && !window.confirm(`Файл «${file.name}» уже существует. Заменить?`)) {
        results.push(`${file.name}: пропущен`);
        continue;
      }
      try {
        const content = await file.text();
        const res = await fetch('/api/agents/sandbox', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: file.name, content }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          results.push(`${file.name}: ${data.error ?? 'не сохранён'}`);
        } else {
          results.push(`${file.name}: загружен`);
        }
      } catch {
        results.push(`${file.name}: не удалось прочитать файл`);
      }
    }
    setNotice(results.join(' · ') || null);
    if (uploadInputRef.current) uploadInputRef.current.value = '';
    await load();
    setBusyOp(null);
  }

  /** Переименование открытого файла: новая запись + удаление старой. */
  async function renameFile(oldName: string) {
    const nextName = window.prompt('Новое имя файла:', oldName);
    if (!nextName || nextName === oldName) return;
    setBusyOp('rename');
    setNotice(null);
    try {
      const getRes = await fetch(`/api/agents/sandbox?file=${encodeURIComponent(oldName)}`, { cache: 'no-store' });
      const getData = (await getRes.json()) as { content?: string; truncated?: boolean; error?: string };
      if (!getRes.ok || getData.content === undefined) throw new Error(getData.error ?? 'Не удалось прочитать файл');
      if (getData.truncated) {
        throw new Error('Файл больше 20 КБ в предпросмотре; переименуйте его после перезагрузки страницы');
      }
      const putRes = await fetch('/api/agents/sandbox', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: nextName, content: getData.content }),
      });
      if (!putRes.ok) {
        const data = (await putRes.json()) as { error?: string };
        throw new Error(data.error ?? 'Не удалось сохранить новое имя');
      }
      await fetch(`/api/agents/sandbox?file=${encodeURIComponent(oldName)}`, { method: 'DELETE' });
      setSelected(null);
      await load();
      setNotice(`Файл переименован: ${nextName}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка переименования');
    }
    setBusyOp(null);
  }

  async function openFile(name: string) {
    setLoadingFile(true);
    setSelected(null);
    try {
      const res = await fetch(`/api/agents/sandbox?file=${encodeURIComponent(name)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('open failed');
      const data = (await res.json()) as { content: string; truncated: boolean };
      setSelected({ name, content: data.content, truncated: data.truncated });
    } catch {
      setSelected({ name, content: 'Не удалось прочитать файл', truncated: false });
    }
    setLoadingFile(false);
  }

  return (
    <div className="flex h-full flex-col bg-[#141225] text-slate-200">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2">
        <Terminal className="size-3.5 text-emerald-400" />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/50">
          /workspace
        </span>
        {(busyOp || notice) && (
          <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-emerald-300" role="status">
            {busyOp && <Loader2 className="size-3 animate-spin" />}
            {notice}
          </span>
        )}
        <button
          type="button"
          onClick={() => uploadInputRef.current?.click()}
          disabled={busyOp === 'upload'}
          aria-label="Загрузить файл"
          title="Загрузить текстовый файл до 200 КБ"
          className="rounded p-1 hover:bg-white/10 disabled:opacity-40"
        >
          {busyOp === 'upload' ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
        </button>
        <input
          ref={uploadInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          aria-label="Выбранные файлы"
          onChange={(event) => void uploadFiles(event.target.files)}
        />
        <button type="button" onClick={() => setView(view === 'list' ? 'grid' : 'list')} className="rounded p-1 hover:bg-white/10" aria-label="Вид">
          {view === 'list' ? <LayoutGrid className="size-3.5" /> : <List className="size-3.5" />}
        </button>
        <button type="button" onClick={() => void load()} className="rounded p-1 hover:bg-white/10" aria-label="Обновить">
          <RefreshCw className="size-3.5" />
        </button>
      </div>

      {files === null && (
        <p className="flex flex-1 items-center justify-center gap-2 text-sm text-white/40"><Loader2 className="size-4 animate-spin" /> Читаю песочницу…</p>
      )}
      {files?.length === 0 && (
        <p className="flex flex-1 items-center justify-center p-6 text-center text-sm text-white/40">
          Песочница пуста. Как только агент создаст файлы — они появятся здесь.
        </p>
      )}
      {error && <p className="p-3 text-xs text-red-300">{error}</p>}

      {files !== null && files.length > 0 && (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {view === 'list' ? (
            <ul className="space-y-0.5">
              {files.map((f) => (
                <li key={f.name}>
                  <button
                    type="button"
                    onClick={() => void openFile(f.name)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-white/10"
                  >
                    <FileIcon name={f.name} />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{f.name}</span>
                    <span className="shrink-0 text-[10px] text-white/40">{f.sizeLabel}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {files.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => void openFile(f.name)}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-white/10 p-3 hover:bg-white/10"
                >
                  <FileIcon name={f.name} />
                  <span className="w-full truncate text-center text-[10px]">{f.name}</span>
                  <span className="text-[10px] text-white/40">{f.sizeLabel}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selected && (
        <div className="flex max-h-[55%] shrink-0 flex-col border-t border-white/10 bg-black/40">
          <div className="flex shrink-0 items-center gap-2 px-3 py-1.5">
            <FileText className="size-3.5 text-sky-300" />
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{selected.name}</span>
            <button
              type="button"
              onClick={() => openInEditor(selected.name)}
              className="rounded px-1.5 py-0.5 text-[10px] text-sky-300 hover:bg-white/10"
            >
              В редактор
            </button>
            <button
              type="button"
              onClick={() => void renameFile(selected.name)}
              disabled={busyOp === 'rename'}
              aria-label="Переименовать файл"
              className="rounded px-1.5 py-0.5 text-[10px] text-white/60 hover:bg-white/10 disabled:opacity-40"
            >
              {busyOp === 'rename' ? <Loader2 className="size-3 animate-spin" /> : <Pencil className="size-3" />} Переименовать
            </button>
            <button
              type="button"
              onClick={() => { void fetch(`/api/agents/sandbox?file=${encodeURIComponent(selected.name)}`, { method: "DELETE" }).then(() => { setSelected(null); void load(); }); }}
              className="rounded px-1.5 py-0.5 text-[10px] text-red-300 hover:bg-white/10"
            >
              Удалить
            </button>
            <a
              href={`/api/agents/sandbox?file=${encodeURIComponent(selected.name)}&download=1`}
              download={selected.name}
              className="rounded px-1.5 py-0.5 text-[10px] text-white/60 hover:bg-white/10"
            >
              Скачать
            </a>
            <button type="button" onClick={() => setSelected(null)} className="rounded px-1.5 py-0.5 text-[10px] text-white/60 hover:bg-white/10">Закрыть</button>
          </div>
          {loadingFile ? (
            <p className="flex items-center gap-2 px-3 pb-3 text-xs text-white/40"><Loader2 className="size-3.5 animate-spin" /> Читаю…</p>
          ) : (
            <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap px-3 pb-3 font-mono text-[11px] leading-relaxed text-slate-300">
              {selected.content}
              {selected.truncated && '\n… (файл показан частично)'}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif'].includes(ext ?? '')) return <ImageIcon className="size-4 text-cyan-400" />;
  if (['mp3', 'wav'].includes(ext ?? '')) return <Music className="size-4 text-purple-400" />;
  if (['mp4', 'webm'].includes(ext ?? '')) return <Film className="size-4 text-pink-400" />;
  if (['zip', 'rar', '7z'].includes(ext ?? '')) return <Archive className="size-4 text-yellow-500" />;
  if (['js', 'ts', 'py', 'json', 'sh', 'bat', 'cmd'].includes(ext ?? '')) return <Code className="size-4 text-emerald-400" />;
  if (['pdf', 'docx', 'txt', 'md', 'csv', 'xlsx'].includes(ext ?? '')) return <FileText className="size-4 text-sky-300" />;
  return <File className="size-4 text-gray-400" />;
}
