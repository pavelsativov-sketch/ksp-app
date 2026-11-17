"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ClipboardPaste, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormDraft } from "@/lib/use-form-draft";
import { parseKtpRows } from "@/lib/ktp-import";
import { useUiLocale } from "@/components/i18n/use-ui-locale";

export default function NewLongTermPage() {
  const router = useRouter();
  const { locale } = useUiLocale();
  const isKk = locale === "kk";

  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");
  const [year, setYear] = useState("2026-2027");
  const [sections, setSections] = useState([
    { title: "", topics: [{ title: "", hours: 1, objectives: "" }] },
  ]);
  const [saving, setSaving] = useState(false);
  const [loadingGoso, setLoadingGoso] = useState(false);
  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [error, setError] = useState("");

  const isDirty =
    Boolean(subject || grade) ||
    sections.some(
      (s) => s.title.trim() || s.topics.some((t) => t.title.trim() || t.objectives.trim()),
    );
  const clearDraft = useFormDraft(
    "draft:longterm:new",
    { subject, grade, year, sections },
    isDirty,
    (d) => {
      setSubject(d.subject ?? "");
      setGrade(d.grade ?? "");
      setYear(d.year ?? "2026-2027");
      if (Array.isArray(d.sections) && d.sections.length > 0) setSections(d.sections);
    },
  );

  const addSection = () => {
    setSections([...sections, { title: "", topics: [{ title: "", hours: 1, objectives: "" }] }]);
  };

  const removeSection = (idx: number) => {
    setSections(sections.filter((_, i) => i !== idx));
  };

  const updateSectionTitle = (idx: number, title: string) => {
    const next = [...sections];
    next[idx] = { ...next[idx], title };
    setSections(next);
  };

  const addTopic = (sectionIdx: number) => {
    const next = [...sections];
    next[sectionIdx] = {
      ...next[sectionIdx],
      topics: [...next[sectionIdx].topics, { title: "", hours: 1, objectives: "" }],
    };
    setSections(next);
  };

  const removeTopic = (sectionIdx: number, topicIdx: number) => {
    const next = [...sections];
    next[sectionIdx] = {
      ...next[sectionIdx],
      topics: next[sectionIdx].topics.filter((_, i) => i !== topicIdx),
    };
    setSections(next);
  };

  const updateTopic = (
    sectionIdx: number,
    topicIdx: number,
    field: string,
    value: string | number,
  ) => {
    const next = [...sections];
    next[sectionIdx] = {
      ...next[sectionIdx],
      topics: next[sectionIdx].topics.map((t, i) =>
        i === topicIdx ? { ...t, [field]: value } : t,
      ),
    };
    setSections(next);
  };

  function applyBulkImport() {
    const rows = parseKtpRows(bulkText);
    if (rows.length === 0) return;

    const grouped = new Map<string, Array<{ title: string; hours: number; objectives: string }>>();
    for (const row of rows) {
      const sec = row.section || (isKk ? "1-бөлім" : "Раздел 1");
      const list = grouped.get(sec) ?? [];
      list.push({ title: row.title, hours: row.hours, objectives: row.objectives });
      grouped.set(sec, list);
    }

    setSections(
      Array.from(grouped.entries()).map(([secTitle, topics]) => ({
        title: secTitle,
        topics,
      })),
    );
    setBulkText("");
    setShowBulkPaste(false);
  }

  async function fillFromGoso() {
    if (!subject.trim() || !grade) {
      setError(
        isKk
          ? "Алдымен пән атауы мен сыныпты көрсетіңіз"
          : "Сначала укажите предмет и класс",
      );
      return;
    }
    setLoadingGoso(true);
    setError("");
    try {
      const qs = new URLSearchParams({ subject: subject.trim(), grade: String(grade) });
      const res = await fetch(`/api/objectives?${qs.toString()}`);
      const data = (await res.json().catch(() => ({}))) as {
        objectives?: Array<{
          code: string;
          text_ru?: string;
          text_kz?: string | null;
          section?: string | null;
        }>;
      };
      const items = data.objectives ?? [];
      if (items.length === 0) {
        setError(
          isKk
            ? "Бұл пән мен сынып үшін МЖМБС мақсаттары табылмады. Тізімді Excel-ден қойыңыз."
            : "Для этого предмета и класса не найдено целей в базе ТУП. Используйте вставку списка из Excel/Word.",
        );
        return;
      }

      const grouped = new Map<string, Array<{ title: string; hours: number; objectives: string }>>();
      for (const obj of items.slice(0, 60)) {
        const sec = obj.section?.trim() || (isKk ? "Оқу бағдарламасы" : "Раздел программы");
        const text = ((isKk ? obj.text_kz : obj.text_ru) || obj.text_ru || "").trim();
        const topicTitle = text.length > 90 ? `${text.slice(0, 88)}…` : text || obj.code;
        const list = grouped.get(sec) ?? [];
        list.push({
          title: topicTitle,
          hours: 1,
          objectives: `${obj.code} ${text}`.trim(),
        });
        grouped.set(sec, list);
      }

      setSections(
        Array.from(grouped.entries()).map(([title, topics]) => ({
          title,
          topics,
        })),
      );
    } finally {
      setLoadingGoso(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/longterm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          grade: Number(grade),
          year,
          sections: sections.filter((s) => s.title.trim()),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Ошибка создания");
      }

      const { plan } = await res.json();
      clearDraft();
      router.push(`/longterm/${plan.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка создания");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
      <Button variant="ghost" asChild className="mb-6">
        <Link href="/longterm">
          <ArrowLeft /> {isKk ? "Артқа" : "Назад"}
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="editorial-display text-3xl">
            {isKk ? "Жаңа ҰМЖ / КТЖ" : "Новый ДСП / КТП"}
          </CardTitle>
          <CardDescription>
            {isKk
              ? "Оқу жылына немесе тоқсанға арналған тақырыптық жоспар (Excel-ден көшіріп қоюға не МЖМБС-тан толтыруға болады)"
              : "Календарно-тематический / долгосрочный план (можно вставить строки из Excel/Word или загрузить из ГОСО)"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {isKk ? "Пән" : "Предмет"}
                </span>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} required />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {isKk ? "Сынып" : "Класс"}
                </span>
                <Input
                  type="number"
                  min={1}
                  max={11}
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {isKk ? "Оқу жылы" : "Учебный год"}
                </span>
                <Input
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2026-2027"
                  required
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowBulkPaste((v) => !v)}
              >
                <ClipboardPaste className="size-4" />
                {isKk ? "Excel / Word кестесінен қою" : "Вставить КТП из Excel / Word / CSV"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void fillFromGoso()}
                disabled={loadingGoso}
              >
                {loadingGoso ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {isKk ? "МЖМБС / ҮОЖ бойынша автотолтыру" : "Заполнить разделы и цели из ГОСО / ТУП"}
              </Button>
            </div>

            {showBulkPaste && (
              <div className="space-y-2.5 rounded-xl border border-primary/30 bg-muted/40 p-4">
                <p className="text-xs font-semibold">
                  {isKk
                    ? "Excel немесе Word кестесінен тақырыптар бағанын көшіріп қойыңыз (Тақырып | Сағат | Оқу мақсаты):"
                    : "Скопируйте и вставьте строки из КТП в Excel или Word (Тема урока | Часы | Код цели ГОСО):"}
                </p>
                <Textarea
                  rows={6}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={
                    "Раздел 1. Квадратные корни\n1\tИррациональные числа\t1\t8.1.1.1\n2\tАрифметический квадратный корень\t2\t8.1.2.1"
                  }
                  className="text-xs"
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShowBulkPaste(false)}>
                    {isKk ? "Болдырмау" : "Отмена"}
                  </Button>
                  <Button type="button" size="sm" onClick={applyBulkImport}>
                    {isKk ? "Тақырыптарды тану" : "Распознать темы"}
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <h3 className="text-lg font-bold">{isKk ? "Бөлімдер" : "Разделы"}</h3>
              {sections.map((section, sIdx) => (
                <div key={sIdx} className="space-y-3 rounded-2xl border border-border p-4">
                  <div className="flex items-center gap-2">
                    <Input
                      value={section.title}
                      onChange={(e) => updateSectionTitle(sIdx, e.target.value)}
                      placeholder={isKk ? "Бөлім атауы" : "Название раздела"}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSection(sIdx)}
                    >
                      <Trash2 />
                    </Button>
                  </div>

                  {section.topics.map((topic, tIdx) => (
                    <div key={tIdx} className="space-y-1.5 pl-4">
                      <div className="flex items-center gap-2">
                        <Input
                          value={topic.title}
                          onChange={(e) => updateTopic(sIdx, tIdx, "title", e.target.value)}
                          placeholder={isKk ? "Сабақ тақырыбы" : "Тема урока"}
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          min={0}
                          value={topic.hours}
                          onChange={(e) => updateTopic(sIdx, tIdx, "hours", Number(e.target.value))}
                          className="w-20"
                          title={isKk ? "Сағат" : "Часы"}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeTopic(sIdx, tIdx)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                      <Input
                        value={topic.objectives}
                        onChange={(e) => updateTopic(sIdx, tIdx, "objectives", e.target.value)}
                        placeholder={isKk ? "Оқу мақсаттары (мыс. 8.1.1.1)" : "Цели обучения ГОСО (необязательно)"}
                        className="text-xs"
                      />
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addTopic(sIdx)}
                  >
                    <Plus /> {isKk ? "Тақырып қосу" : "Добавить тему"}
                  </Button>
                </div>
              ))}

              <Button type="button" variant="outline" onClick={addSection}>
                <Plus /> {isKk ? "Бөлім қосу" : "Добавить раздел"}
              </Button>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => router.back()}>
                {isKk ? "Болдырмау" : "Отмена"}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving
                  ? isKk
                    ? "Сақталуда…"
                    : "Сохранение…"
                  : isKk
                    ? "Жоспар құру"
                    : "Создать план"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
