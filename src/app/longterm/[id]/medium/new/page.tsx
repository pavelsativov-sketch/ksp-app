"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ClipboardPaste, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFormDraft } from "@/lib/use-form-draft";
import { parseKtpRows } from "@/lib/ktp-import";
import { useUiLocale } from "@/components/i18n/use-ui-locale";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function NewMediumTermPage({ params }: PageProps) {
  const router = useRouter();
  const { id } = use(params);
  const { locale } = useUiLocale();
  const isKk = locale === "kk";

  const [quarter, setQuarter] = useState("1");
  const [title, setTitle] = useState("");
  const [topics, setTopics] = useState([{ title: "", hours: 1, kspIds: [] as string[] }]);
  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isDirty = Boolean(title.trim()) || topics.some((t) => t.title.trim());
  const clearDraft = useFormDraft(
    `draft:mediumterm:new:${id}`,
    { quarter, title, topics },
    isDirty,
    (d) => {
      setQuarter(d.quarter ?? "1");
      setTitle(d.title ?? "");
      if (Array.isArray(d.topics) && d.topics.length > 0) setTopics(d.topics);
    },
  );

  const addTopic = () => {
    setTopics([...topics, { title: "", hours: 1, kspIds: [] }]);
  };

  const removeTopic = (idx: number) => {
    setTopics(topics.filter((_, i) => i !== idx));
  };

  const updateTopic = (idx: number, field: string, value: string | number) => {
    const next = [...topics];
    next[idx] = { ...next[idx], [field]: value };
    setTopics(next);
  };

  function applyBulkImport() {
    const rows = parseKtpRows(bulkText);
    if (rows.length === 0) return;
    setTopics(rows.map((r) => ({ title: r.title, hours: r.hours, kspIds: [] })));
    setBulkText("");
    setShowBulkPaste(false);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/mediumterm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          longTermId: id,
          quarter: Number(quarter),
          title,
          topics: topics.filter((t) => t.title.trim()),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Ошибка создания");
      }

      const { plan } = await res.json();
      clearDraft();
      router.push(`/longterm/${id}/medium/${plan.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка создания");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
      <Button variant="ghost" asChild className="mb-6">
        <Link href={`/longterm/${id}`}>
          <ArrowLeft /> {isKk ? "Артқа" : "Назад"}
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="editorial-display text-3xl">
            {isKk ? "Тоқсанға арналған жаңа КТЖ / ОМЖ" : "Новый КТП / ССП на четверть"}
          </CardTitle>
          <CardDescription>
            {isKk
              ? "Тоқсандық тақырыптар тізімі (кейін әр сабақ бойынша 1 басумен ҚМЖ + жинақ жасайсыз)"
              : "Поурочный план на четверть — после сохранения напротив каждой темы появится кнопка «Создать КСП + комплект»"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {isKk ? "Тоқсан" : "Четверть"}
                </span>
                <Select value={quarter} onValueChange={setQuarter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{isKk ? "1 тоқсан" : "1 четверть"}</SelectItem>
                    <SelectItem value="2">{isKk ? "2 тоқсан" : "2 четверть"}</SelectItem>
                    <SelectItem value="3">{isKk ? "3 тоқсан" : "3 четверть"}</SelectItem>
                    <SelectItem value="4">{isKk ? "4 тоқсан" : "4 четверть"}</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {isKk ? "Атауы" : "Название"}
                </span>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={isKk ? "1-тоқсан КТЖ" : "КТП на 1 четверть"}
                  required
                />
              </label>
            </div>

            <div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowBulkPaste((v) => !v)}
              >
                <ClipboardPaste className="size-4" />
                {isKk ? "Excel / Word тізімінен тақырыптарды қою" : "Вставить список тем из Excel / Word / CSV"}
              </Button>
            </div>

            {showBulkPaste && (
              <div className="space-y-2.5 rounded-xl border border-primary/30 bg-muted/40 p-4">
                <p className="text-xs font-semibold">
                  {isKk
                    ? "Сабақ тақырыптарын әр жолға біреуден немесе Excel кестесінен қойыңыз:"
                    : "Вставьте темы уроков четверти (по одной в строке или скопировав столбцы из Excel/Word):"}
                </p>
                <Textarea
                  rows={6}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={"1. Квадратные корни — 1 ч.\n2. Свойства квадратного корня — 2 ч."}
                  className="text-xs"
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShowBulkPaste(false)}>
                    {isKk ? "Болдырмау" : "Отмена"}
                  </Button>
                  <Button type="button" size="sm" onClick={applyBulkImport}>
                    {isKk ? "Қолдану" : "Распознать темы"}
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <h3 className="text-lg font-bold">{isKk ? "Сабақ тақырыптары" : "Темы уроков"}</h3>
              {topics.map((topic, tIdx) => (
                <div key={tIdx} className="flex items-center gap-2">
                  <span className="w-6 text-right text-xs text-muted-foreground">{tIdx + 1}.</span>
                  <Input
                    value={topic.title}
                    onChange={(e) => updateTopic(tIdx, "title", e.target.value)}
                    placeholder={isKk ? "Сабақ тақырыбы" : "Тема урока"}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min={0}
                    value={topic.hours}
                    onChange={(e) => updateTopic(tIdx, "hours", Number(e.target.value))}
                    className="w-20"
                    title={isKk ? "Сағат" : "Часы"}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeTopic(tIdx)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}

              <Button type="button" variant="outline" onClick={addTopic}>
                <Plus /> {isKk ? "Тақырып қосу" : "Добавить тему"}
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
