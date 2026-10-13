"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
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
  embedding?: {
    status: "pending" | "processing" | "ready" | "error";
    completed: number;
    total: number;
    error: string | null;
  };
  page_count: number | null;
  chunk_count: number;
  visibility: "private" | "unlisted" | "public";
  owner_id: string;
  armanpv_id?: string | null;
  source_url?: string | null;
  cover_url?: string | null;
  language?: "ru" | "kz" | "ug" | "uz" | null;
  created_at: string;
}

interface ArmanPvCatalogEntry {
  id: string;
  grade: number;
  title: string;
  description: string;
  language: "ru" | "kz" | "ug" | "uz";
  subjectNameRu: string | null;
  subjectId: string | null;
  isGuide: boolean;
  coverUrl: string | null;
  pdfUrl: string;
  epubUrl: string | null;
  sourcePageUrl: string;
  ingestedTextbookId: string | null;
  status: "not_ingested" | "pending" | "indexing" | "ready" | "error";
  statusError: string | null;
  pageCount: number | null;
  chunkCount: number;
  embedding: Textbook["embedding"] | null;
}

const NONE = "__none__";
const ALL = "__all__";

export function TextbooksManager({ subjects }: { subjects: SubjectRow[] }) {
  const [items, setItems] = useState<Textbook[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Arman-PV catalog state
  const [catalog, setCatalog] = useState<ArmanPvCatalogEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogGrade, setCatalogGrade] = useState<string>("7");
  const [catalogSubject, setCatalogSubject] = useState<string>(ALL);
  const [catalogLang, setCatalogLang] = useState<string>(ALL);
  const [catalogKind, setCatalogKind] = useState<"all" | "textbook" | "guide">("textbook");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [importingId, setImportingId] = useState<string | null>(null);
  const [syncingLive, setSyncingLive] = useState(false);
  const [catalogMessage, setCatalogMessage] = useState<{
    type: "ok" | "error";
    text: string;
  } | null>(null);

  // upload form state
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [grade, setGrade] = useState<number | "">("");
  const [subjectId, setSubjectId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [embeddingId, setEmbeddingId] = useState<string | null>(null);
  const activeEmbedding = useRef<string | null>(null);

  useEffect(
    () => () => {
      activeEmbedding.current = null;
    },
    [],
  );

  const loadCatalog = useCallback(async (opts?: { liveGrade?: number }) => {
    try {
      const params = new URLSearchParams();
      if (opts?.liveGrade) {
        params.set("grade", String(opts.liveGrade));
        params.set("live", "1");
      }
      const res = await fetch(
        `/api/textbooks/armanpv${params.size > 0 ? `?${params.toString()}` : ""}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { items?: ArmanPvCatalogEntry[] };
      if (opts?.liveGrade && data.items) {
        setCatalog((prev) => {
          const others = prev.filter((p) => p.grade !== opts.liveGrade);
          return [...others, ...data.items!];
        });
      } else {
        setCatalog(data.items ?? []);
      }
    } catch {
      // Ignore transient catalog fetch error
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  async function refresh() {
    try {
      const res = await fetch("/api/textbooks");
      if (!res.ok) throw new Error("Не удалось загрузить список учебников");
      const data = (await res.json()) as {
        textbooks: Textbook[];
        currentUserId?: string | null;
      };
      setItems(data.textbooks ?? []);
      setCurrentUserId(data.currentUserId ?? null);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Не удалось загрузить список учебников",
      );
    }
  }

  useEffect(() => {
    (async () => {
      await Promise.all([refresh(), loadCatalog()]);
      setLoading(false);
    })();
  }, [loadCatalog]);

  async function resumeEmbeddings(id: string) {
    if (activeEmbedding.current) return;
    activeEmbedding.current = id;
    setEmbeddingId(id);
    setUploadError(null);
    try {
      while (activeEmbedding.current === id) {
        const res = await fetch(`/api/textbooks/${id}/embeddings`, { method: "POST" });
        const data = (await res.json()) as {
          embedding?: Textbook["embedding"];
          error?: string;
        };
        if (data.embedding) {
          setItems((prev) =>
            prev.map((t) => (t.id === id ? { ...t, embedding: data.embedding } : t)),
          );
          setCatalog((prev) =>
            prev.map((c) =>
              c.ingestedTextbookId === id ? { ...c, embedding: data.embedding ?? null } : c,
            ),
          );
        }
        if (!res.ok) {
          throw new Error(data.embedding?.error ?? data.error ?? "Не удалось обработать пакет");
        }
        if (!data.embedding || data.embedding.status !== "pending") break;
      }
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Ошибка индексации. Повторите позже.",
      );
    } finally {
      activeEmbedding.current = null;
      setEmbeddingId(null);
    }
  }

  async function importArmanPvTextbook(entry: ArmanPvCatalogEntry) {
    setImportingId(entry.id);
    setCatalogMessage(null);
    try {
      const res = await fetch("/api/textbooks/armanpv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          armanpvId: entry.id,
          subjectId: entry.subjectId || null,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        cached?: boolean;
        textbook?: Textbook;
      };
      if (!res.ok || !data.textbook) {
        throw new Error(data.error ?? `Ошибка подключения (HTTP ${res.status})`);
      }
      const tb = data.textbook;
      setCatalogMessage({
        type: "ok",
        text: data.cached
          ? `Учебник «${entry.title}» (${entry.grade} кл.) уже проиндексирован (${tb.chunk_count} фрагментов) и готов к использованию в генераторе КСП.`
          : `Учебник «${entry.title}» (${entry.grade} кл.) скачан с armanpv.com и проиндексирован (${tb.page_count ?? "?"} стр., ${tb.chunk_count} фрагментов).`,
      });
      await Promise.all([refresh(), loadCatalog()]);
    } catch (err) {
      setCatalogMessage({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Не удалось скачать и проиндексировать учебник с armanpv.com",
      });
    } finally {
      setImportingId(null);
    }
  }

  async function handleLiveSync() {
    const g = Number(catalogGrade);
    if (!Number.isInteger(g) || g < 1 || g > 11) return;
    setSyncingLive(true);
    setCatalogMessage(null);
    try {
      await loadCatalog({ liveGrade: g });
      setCatalogMessage({
        type: "ok",
        text: `Каталог ${g} класса синхронизирован напрямую с https://www.armanpv.com/${g}-klass.`,
      });
    } catch {
      setCatalogMessage({
        type: "error",
        text: "Не удалось обновить страницу с armanpv.com",
      });
    } finally {
      setSyncingLive(false);
    }
  }

  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return catalog.filter((item) => {
      if (catalogGrade !== ALL && item.grade !== Number(catalogGrade)) return false;
      if (catalogLang !== ALL && item.language !== catalogLang) return false;
      if (catalogKind === "textbook" && item.isGuide) return false;
      if (catalogKind === "guide" && !item.isGuide) return false;
      if (catalogSubject !== ALL) {
        const subjObj = subjects.find((s) => s.id === catalogSubject);
        const matchesId = item.subjectId === catalogSubject;
        const matchesName =
          subjObj &&
          (item.subjectNameRu ?? "").toLowerCase() === subjObj.name_ru.toLowerCase();
        if (!matchesId && !matchesName) return false;
      }
      if (q) {
        const hay = `${item.title} ${item.description} ${item.subjectNameRu ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [catalog, catalogGrade, catalogLang, catalogKind, catalogSubject, catalogSearch, subjects]);

  // Опрос статуса, пока есть учебники в очереди индексации/эмбеддингов.
  useEffect(() => {
    const hasPending = items.some(
      (t) =>
        t.status === "pending" ||
        t.status === "indexing" ||
        t.embedding?.status === "processing",
    );
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
      await Promise.all([refresh(), loadCatalog()]);
    } else {
      setUploadError("Не удалось удалить учебник");
    }
  }

  return (
    <div className="space-y-6">
      {/* Каталог учебников издательства Арман-ПВ (https://www.armanpv.com/) */}
      <Card className="border-emerald-200/80 bg-gradient-to-b from-emerald-50/40 to-surface">
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-700" />
                Каталог учебников издательства «Арман-ПВ» (1–11 классы)
              </CardTitle>
              <CardDescription className="mt-1">
                Официальные электронные учебники и методические руководства с сайта{" "}
                <a
                  href="https://www.armanpv.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-emerald-800 underline underline-offset-2"
                >
                  armanpv.com
                </a>
                . Подключите нужный учебник в один клик — он автоматически скачается, разобьётся
                по параграфам и заданиям и станет доступен в генераторе КСП без расхода личной квоты.
              </CardDescription>
            </div>
            {catalogGrade !== ALL && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={syncingLive}
                onClick={() => void handleLiveSync()}
                title="Проверить обновления на сайте armanpv.com"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingLive ? "animate-spin" : ""}`} />
                Синхронизировать {catalogGrade} кл.
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <Label>Класс</Label>
              <Select value={catalogGrade} onValueChange={setCatalogGrade}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Все классы (1–11)</SelectItem>
                  {Array.from({ length: 11 }, (_, i) => i + 1).map((g) => (
                    <SelectItem key={g} value={String(g)}>
                      {g} класс
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Предмет</Label>
              <Select value={catalogSubject} onValueChange={setCatalogSubject}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Все предметы</SelectItem>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name_ru}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Язык обучения</Label>
              <Select value={catalogLang} onValueChange={setCatalogLang}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Все языки</SelectItem>
                  <SelectItem value="ru">Русский</SelectItem>
                  <SelectItem value="kz">Қазақша</SelectItem>
                  <SelectItem value="ug">Ұйғырша</SelectItem>
                  <SelectItem value="uz">O‘zbekcha</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Тип издания</Label>
              <Select
                value={catalogKind}
                onValueChange={(v) => setCatalogKind(v as "all" | "textbook" | "guide")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="textbook">Учебники</SelectItem>
                  <SelectItem value="guide">Методические руководства</SelectItem>
                  <SelectItem value="all">Все издания</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Поиск</Label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                <Input
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Информатика, Алгебра..."
                  className="pl-8"
                />
              </div>
            </div>
          </div>

          {catalogMessage && (
            <div
              role="status"
              className={`rounded-xl border p-3 text-sm ${
                catalogMessage.type === "ok"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-[#e8c8bf] bg-[#f7e6e1] text-[#a84023]"
              }`}
            >
              {catalogMessage.text}
            </div>
          )}

          {catalogLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-[#8a817a]">
              <Loader2 className="w-4 h-4 animate-spin" />
              Загружаем каталог учебников Арман-ПВ…
            </div>
          ) : filteredCatalog.length === 0 ? (
            <p className="py-4 text-sm text-[#8a817a]">
              По выбранным фильтрам учебники в каталоге Арман-ПВ не найдены. Попробуйте выбрать
              «Все классы» или «Все издания».
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {filteredCatalog.map((item) => {
                const isReady = item.status === "ready";
                const isImporting = importingId === item.id;
                const langBadge =
                  item.language === "kz"
                    ? "Қазақша"
                    : item.language === "ru"
                      ? "Русский"
                      : item.language === "ug"
                        ? "Ұйғырша"
                        : "O‘zbekcha";
                return (
                  <div
                    key={item.id}
                    className="flex gap-3 rounded-xl border border-[#ddd5cb] bg-white/90 p-3 shadow-xs"
                  >
                    {item.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.coverUrl}
                        alt={item.title}
                        className="h-24 w-18 shrink-0 rounded border border-slate-200 object-cover bg-slate-100"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-24 w-18 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-100 text-slate-400">
                        <BookOpen className="w-6 h-6" />
                      </div>
                    )}

                    <div className="flex min-w-0 flex-1 flex-col justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-sm text-slate-900">
                            {item.title}
                          </span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
                            {item.grade} кл.
                          </span>
                          <span className="rounded bg-emerald-100/80 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">
                            {langBadge}
                          </span>
                          {item.isGuide && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">
                              Метод. пособие
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                            {item.description}
                          </p>
                        )}
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs">
                          <a
                            href={item.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-sky-700 hover:underline"
                          >
                            <ExternalLink className="w-3 h-3" />
                            PDF
                          </a>
                          {item.epubUrl && (
                            <a
                              href={item.epubUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-slate-500 hover:underline"
                            >
                              EPUB
                            </a>
                          )}
                        </div>

                        {isReady ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Подключён ({item.chunkCount} фрагм.)
                          </span>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isImporting || importingId !== null}
                            onClick={() => void importArmanPvTextbook(item)}
                          >
                            {isImporting ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Индексация с armanpv.com…
                              </>
                            ) : (
                              <>
                                <Download className="w-3.5 h-3.5" />
                                Подключить для AI КСП
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Загрузить свой PDF учебника</CardTitle>
          <CardDescription>
            Если нужного пособия нет в каталоге Арман-ПВ, загрузите собственный PDF до 50 МБ. Поиск
            по словам доступен сразу после загрузки; нажмите «Продолжить индексацию» для смыслового
            поиска (embeddings).
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
          <CardTitle>Подключённые и загруженные учебники</CardTitle>
          <CardDescription>
            Все готовые учебники ниже доступны при генерации КСП.
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
              {items.map((t) => {
                const canAdvanceEmbeddings =
                  t.owner_id === currentUserId || t.owner_id === "system:armanpv";
                return (
                  <li key={t.id} className="py-3 flex items-center gap-3">
                    <BookOpen className="w-5 h-5 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium truncate">{t.title}</span>
                        {t.armanpv_id && (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">
                            Арман-ПВ
                          </span>
                        )}
                        {t.source_url && (
                          <a
                            href={t.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-sky-700 hover:underline"
                          >
                            <ExternalLink className="w-3 h-3" />
                            PDF
                          </a>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-3 flex-wrap">
                        {t.grade && <span>{t.grade} класс</span>}
                        {t.page_count && <span>{t.page_count} стр.</span>}
                        {t.chunk_count > 0 && <span>{t.chunk_count} фрагментов</span>}
                        <StatusBadge status={t.status} error={t.status_error} />
                      </div>
                      {t.status === "ready" && t.embedding && (
                        <div className="mt-2 space-y-2 text-xs" aria-live="polite">
                          <p>
                            Смысловой поиск:{" "}
                            {t.embedding.status === "ready"
                              ? "готов"
                              : t.embedding.status === "error"
                                ? "ошибка"
                                : t.embedding.status === "processing"
                                  ? "обработка пакета"
                                  : "ожидает продолжения"}
                            {` — ${t.embedding.completed} / ${t.embedding.total} фрагментов`}
                          </p>
                          {t.embedding.status !== "ready" && (
                            <p className="text-amber-800">
                              Пока доступен резервный поиск по словам. {t.embedding.error}
                            </p>
                          )}
                          {canAdvanceEmbeddings &&
                            t.embedding.status !== "ready" &&
                            (embeddingId === t.id ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  activeEmbedding.current = null;
                                }}
                              >
                                Пауза после текущего пакета
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={
                                  embeddingId !== null || t.embedding.status === "processing"
                                }
                                onClick={() => void resumeEmbeddings(t.id)}
                              >
                                {t.embedding.status === "error"
                                  ? "Повторить индексацию"
                                  : "Продолжить индексацию"}
                              </Button>
                            ))}
                        </div>
                      )}
                    </div>
                    {t.owner_id === currentUserId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(t.id)}
                        title="Удалить"
                        disabled={
                          embeddingId === t.id || t.embedding?.status === "processing"
                        }
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </li>
                );
              })}
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
