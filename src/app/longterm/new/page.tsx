"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewLongTermPage() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");
  const [year, setYear] = useState("");
  const [sections, setSections] = useState([{ title: "", topics: [{ title: "", hours: 1, objectives: "" }] }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

  const updateTopic = (sectionIdx: number, topicIdx: number, field: string, value: string | number) => {
    const next = [...sections];
    next[sectionIdx] = {
      ...next[sectionIdx],
      topics: next[sectionIdx].topics.map((t, i) =>
        i === topicIdx ? { ...t, [field]: value } : t,
      ),
    };
    setSections(next);
  };

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
          <ArrowLeft /> Назад
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="editorial-display text-3xl">Новый ДСП</CardTitle>
          <CardDescription>Долгосрочный план на учебный год</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Предмет
                </span>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} required />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Класс
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
                  Учебный год
                </span>
                <Input
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2025-2026"
                  required
                />
              </label>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-bold">Разделы</h3>
              {sections.map((section, sIdx) => (
                <div key={sIdx} className="rounded-2xl border border-border p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Input
                      value={section.title}
                      onChange={(e) => updateSectionTitle(sIdx, e.target.value)}
                      placeholder="Название раздела"
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
                    <div key={tIdx} className="flex items-center gap-2 pl-4">
                      <Input
                        value={topic.title}
                        onChange={(e) => updateTopic(sIdx, tIdx, "title", e.target.value)}
                        placeholder="Тема"
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        min={0}
                        value={topic.hours}
                        onChange={(e) => updateTopic(sIdx, tIdx, "hours", Number(e.target.value))}
                        className="w-20"
                        title="Часы"
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
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addTopic(sIdx)}
                  >
                    <Plus /> Добавить тему
                  </Button>
                </div>
              ))}

              <Button type="button" variant="outline" onClick={addSection}>
                <Plus /> Добавить раздел
              </Button>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => router.back()}>
                Отмена
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Сохранение…" : "Создать план"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
