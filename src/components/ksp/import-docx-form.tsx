"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveImportedPlanAction } from "@/app/actions/import-plan";
import type { AiKspPayload } from "@/lib/ai/prompt";
import type { SubjectRow } from "@/lib/types/ksp";

interface Props {
  subjects: SubjectRow[];
  defaultGrade?: number;
}

interface ImportResponse {
  payload: AiKspPayload;
  preview?: string;
  charCount?: number;
  error?: string;
}

export function ImportDocxForm({ subjects, defaultGrade }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<"ru" | "kz">("ru");
  const [grade, setGrade] = useState<number>(defaultGrade ?? 5);
  const [subjectId, setSubjectId] = useState<string>(subjects[0]?.id ?? "");
  const [section, setSection] = useState("");
  const [quarter, setQuarter] = useState<number | "">("");
  const [phase, setPhase] = useState<"idle" | "parsing" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const subjectName = (s: SubjectRow) =>
    language === "kz" ? s.name_kz || s.name_ru : s.name_ru;

  async function submit() {
    if (!file) return;
    setError(null);
    setPreview(null);
    setPhase("parsing");

    const fd = new FormData();
    fd.append("file", file);
    fd.append("language", language);
    fd.append("grade", String(grade));
    const subj = subjects.find((s) => s.id === subjectId);
    if (subj) fd.append("subject", subj.name_ru);

    let res: Response;
    try {
      res = await fetch("/api/import/docx", { method: "POST", body: fd });
    } catch {
      setPhase("idle");
      setError("Нет связи. Попробуйте ещё раз.");
      return;
    }

    let json: ImportResponse;
    try {
      json = (await res.json()) as ImportResponse;
    } catch {
      setPhase("idle");
      setError("Сервер вернул некорректный ответ");
      return;
    }

    if (!res.ok || json.error) {
      setPhase("idle");
      setError(json.error ?? `Ошибка ${res.status}`);
      return;
    }

    if (json.preview) setPreview(json.preview);

    setPhase("saving");
    const save = await saveImportedPlanAction({
      title: file.name.replace(/\.docx$/i, ""),
      subject_id: subjectId || null,
      grade,
      quarter: typeof quarter === "number" ? quarter : null,
      section: section.trim() || null,
      language,
      payload: json.payload,
    });
    if (save.error || !save.id) {
      setPhase("idle");
      setError(save.error ?? "Не удалось сохранить план");
      return;
    }
    router.push(`/plans/${save.id}/edit`);
  }

  const busy = phase !== "idle";

  return (
    <div className="space-y-5">
      <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <FileText className="mx-auto w-10 h-10 text-slate-400" />
        <p className="mt-2 text-slate-700">
          {file ? (
            <>
              Выбрано:{" "}
              <span className="font-medium">{file.name}</span> (
              {Math.round(file.size / 1024)} КБ)
            </>
          ) : (
            "Выберите .docx файл с уже написанным КСП"
          )}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            setError(null);
          }}
          disabled={busy}
        />
        <div className="mt-3 flex justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            <Upload /> {file ? "Заменить" : "Выбрать файл"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="lang">Язык плана</Label>
          <select
            id="lang"
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            value={language}
            onChange={(e) => setLanguage(e.target.value as "ru" | "kz")}
            disabled={busy}
          >
            <option value="ru">Русский</option>
            <option value="kz">Қазақ тілі</option>
          </select>
        </div>
        <div>
          <Label htmlFor="grade">Класс</Label>
          <Input
            id="grade"
            type="number"
            min={1}
            max={12}
            value={grade}
            onChange={(e) => setGrade(Number(e.target.value) || 5)}
            disabled={busy}
          />
        </div>
        <div>
          <Label htmlFor="subject">Предмет</Label>
          <select
            id="subject"
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            disabled={busy || subjects.length === 0}
          >
            {subjects.length === 0 && (
              <option value="">— нет предметов —</option>
            )}
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {subjectName(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="quarter">Четверть</Label>
            <select
              id="quarter"
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              value={quarter === "" ? "" : String(quarter)}
              onChange={(e) =>
                setQuarter(e.target.value === "" ? "" : Number(e.target.value))
              }
              disabled={busy}
            >
              <option value="">—</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
            </select>
          </div>
          <div>
            <Label htmlFor="section">Раздел</Label>
            <Input
              id="section"
              placeholder="Напр. 7.1A"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-sm px-3 py-2">
          {error}
        </div>
      )}

      <Button
        type="button"
        className="w-full"
        size="lg"
        disabled={!file || busy}
        onClick={submit}
      >
        {phase === "parsing" && (
          <>
            <Loader2 className="animate-spin" /> Распознаём…
          </>
        )}
        {phase === "saving" && (
          <>
            <Loader2 className="animate-spin" /> Сохраняем…
          </>
        )}
        {phase === "idle" && (
          <>
            <Upload /> Загрузить и распознать
          </>
        )}
      </Button>

      {preview && (
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer hover:text-slate-700">
            Превью извлечённого текста (первые 1000 символов)
          </summary>
          <pre className="mt-2 whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded p-3 max-h-60 overflow-y-auto">
            {preview}
          </pre>
        </details>
      )}

      <p className="text-xs text-slate-500">
        Распознавание занимает 30–60 секунд. После этого вы попадёте на
        страницу редактирования — проверьте поля и сохраните.
      </p>
    </div>
  );
}
