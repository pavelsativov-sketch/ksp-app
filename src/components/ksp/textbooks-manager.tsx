"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Loader2,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SubjectRow } from "@/lib/types/ksp";

interface Textbook {
  id: string;
  title: string;
  grade: number | null;
  subject_id: string | null;
  status: "pending" | "indexing" | "ready" | "error";
  status_error?: string | null;
  embedding?: { status: "pending" | "processing" | "ready" | "error"; completed: number; total: number; error: string | null };
  page_count: number | null;
  chunk_count: number;
  visibility: "private" | "unlisted" | "public";
  owner_id: string;
  created_at: string;
}

const NONE = "__none__";

export function TextbooksManager({ subjects }: { subjects: SubjectRow[] }) {
  const [items, setItems] = useState<Textbook[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // upload form state
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [grade, setGrade] = useState<number | "">("");
  const [subjectId, setSubjectId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [embeddingId, setEmbeddingId] = useState<string | null>(null);
  const activeEmbedding = useRef<string | null>(null);
  useEffect(() => () => { activeEmbedding.current = null; }, []);

  async function resumeEmbeddings(id: string) {
    if (activeEmbedding.current) return;
    activeEmbedding.current = id;
    setEmbeddingId(id);
    setUploadError(null);
    try {
      // Only run after an explicit click; each response commits one batch.
      while (activeEmbedding.current === id) {
        const res = await fetch(`/api/textbooks/${id}/embeddings`, { method: "POST" });
        const data = await res.json() as { embedding?: Textbook["embedding"]; error?: string };
        if (data.embedding) {
          setItems((prev) => prev.map((t) => t.id === id ? { ...t, embedding: data.embedding } : t));
        }
        if (!res.ok) throw new Error(data.embedding?.error ?? data.error ?? "Не удалось обработать пакет");
        if (!data.embedding || data.embedding.status !== "pending") break;
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Ошибка индексации. Повторите позже.");
    } finally {
      activeEmbedding.current = null;
      setEmbeddingId(null);
    }
  }

  async function refresh() {
    try {
      const res = await fetch("/api/textbooks");
      if (!res.ok) throw new Error("Не удалось загрузить список учебников");
      const data = (await res.json()) as { textbooks: Textbook[]; currentUserId?: string | null };
      setItems(data.textbooks ?? []);
      setCurrentUserId(data.currentUserId ?? null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Не удалось загрузить список учебников");
    }
  }

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, []);

  // Опрос статуса, пока есть учебники в очереди индексации/эмбеддингов.
  useEffect(() => {
    const hasPending = items.some((t) => t.status === "pending" || t.status === "indexing" || t.embedding?.status === "processing");
    if (!hasPending) return;
    const t = setTimeout(() => void refresh(), 3000);
    return () => clearTimeout(t);
  }, [items]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    setUploadError(null);
    if (!file) {
      setUploadError("Выберите PDF");
      return;
    }
    if (!title.trim()) {
      setUploadError("Укажите название");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title.trim());
      if (grade !== "") fd.append("grade", String(grade));
      if (subjectId) fd.append("subjectId", subjectId);
      const res = await fetch("/api/textbooks/upload", { method: "POST", body: fd });
      const data = (await res.json()) as { error?: string; status?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setFile(null);
      setTitle("");
      setGrade("");
      setSubjectId("");
      await refresh();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Удалить учебник? Все его чанки также будут удалены.")) return;
    const res = await fetch(`/api/textbooks/${id}`, { method: "DELETE" });
    if (res.ok) {
      await refresh();
    } else {
      setUploadError("Не удалось удалить учебник");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Загрузить учебник</CardTitle>
          <CardDescription>
            PDF до 50 МБ. Поиск по словам доступен после загрузки. Нажмите «Продолжить индексацию»
            для смыслового поиска (embeddings). Прогресс сохраняется после каждого пакета;
            после закрытия страницы можно продолжить. Векторы считаются бесплатно через Cloudflare (или OpenAI, если задан его ключ); без них работает только поиск по словам.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={upload} className="space-y-3">
            <div>
              <Label>PDF файл</Label>
              <Input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-1">
                <Label>Название</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Напр. «Математика 5 класс. Учебник»"
                />
              </div>
              <div>
                <Label>Класс</Label>
                <Input
                  type="number"
                  min={1}
                  max={11}
                  value={grade}
                  onChange={(e) =>
                    setGrade(e.target.value === "" ? "" : Number(e.target.value))
                  }
                />
              </div>
              <div>
                <Label>Предмет</Label>
                <Select
                  value={subjectId || NONE}
                  onValueChange={(v) => setSubjectId(v === NONE ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name_ru}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {uploadError && (
              <p className="rounded-xl border border-[#e8c8bf] bg-[#f7e6e1] p-3 text-sm text-[#a84023]">
                {uploadError}
              </p>
            )}
            <Button type="submit" disabled={uploading}>
              {uploading ? (
                <>
                  <Loader2 className="animate-spin" />
                  Индексация…
                </>
              ) : (
                <>
                  <Upload />
                  Загрузить и проиндексировать
                </>
              )}
            </Button>
            <p className="text-xs text-[#6b7480]">
              Индексация большой PDF может занять до 1–3 минут.
            </p>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Мои учебники</CardTitle>
          <CardDescription>
            Готовые учебники доступны в выпадающем списке у AI-генерации КСП.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-[#8a817a]">
              <Loader2 className="w-4 h-4 animate-spin" /> Загрузка…
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-[#8a817a]">Учебники ещё не загружены.</p>
          ) : (
            <ul className="divide-y divide-[#ddd5cb]">
              {items.map((t) => (
                <li key={t.id} className="py-3 flex items-center gap-3">
                  <BookOpen className="w-5 h-5 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{t.title}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-3 flex-wrap">
                      {t.grade && <span>{t.grade} класс</span>}
                      {t.page_count && <span>{t.page_count} стр.</span>}
                      {t.chunk_count > 0 && <span>{t.chunk_count} фрагментов</span>}
                      <StatusBadge status={t.status} error={t.status_error} />
                    </div>
                    {t.status === "ready" && t.embedding && (
                      <div className="mt-2 space-y-2 text-xs" aria-live="polite">
                        <p>
                          Смысловой поиск: {t.embedding.status === "ready" ? "готов" : t.embedding.status === "error" ? "ошибка" : t.embedding.status === "processing" ? "обработка пакета" : "ожидает продолжения"}
                          {` — ${t.embedding.completed} / ${t.embedding.total} фрагментов`}
                        </p>
                        {t.embedding.status !== "ready" && <p className="text-amber-800">Пока доступен резервный поиск по словам. {t.embedding.error}</p>}
                        {t.owner_id === currentUserId && t.embedding.status !== "ready" && (
                          embeddingId === t.id ? (
                            <Button type="button" size="sm" variant="outline" onClick={() => { activeEmbedding.current = null; }}>
                              Пауза после текущего пакета
                            </Button>
                          ) : (
                            <Button type="button" size="sm" variant="outline" disabled={embeddingId !== null || t.embedding.status === "processing"} onClick={() => void resumeEmbeddings(t.id)}>
                              {t.embedding.status === "error" ? "Повторить индексацию" : "Продолжить индексацию"}
                            </Button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                  {t.owner_id === currentUserId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(t.id)}
                      title="Удалить"
                      disabled={embeddingId === t.id || t.embedding?.status === "processing"}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({
  status,
  error,
}: {
  status: Textbook["status"];
  error?: string | null;
}) {
  if (status === "ready") {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-700">
        <CheckCircle2 className="w-3 h-3" /> готов
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-red-700" title={error ?? ""}>
        <TriangleAlert className="w-3 h-3" /> ошибка
        {error ? `: ${error.slice(0, 80)}` : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-amber-700">
      <Clock className="w-3 h-3" /> {status === "indexing" ? "индексация…" : "ожидание"}
    </span>
  );
}
