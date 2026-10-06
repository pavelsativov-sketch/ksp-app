"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function NewMediumTermPage({ params }: PageProps) {
  const router = useRouter();
  const [quarter, setQuarter] = useState("1");
  const [title, setTitle] = useState("");
  const [topics, setTopics] = useState([{ title: "", hours: 1, kspIds: [] as string[] }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const { id } = await params;
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
      router.push(`/longterm/${id}/medium/${plan.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка создания");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
      <Button variant="ghost" asChild className="mb-6">
        <a href="javascript:history.back()">
          <ArrowLeft /> Назад
        </a>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="editorial-display text-3xl">Новый ССП</CardTitle>
          <CardDescription>Среднесрочный план на четверть</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Четверть
                </span>
                <Select value={quarter} onValueChange={setQuarter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 четверть</SelectItem>
                    <SelectItem value="2">2 четверть</SelectItem>
                    <SelectItem value="3">3 четверть</SelectItem>
                    <SelectItem value="4">4 четверть</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Название
                </span>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
              </label>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-bold">Темы</h3>
              {topics.map((topic, tIdx) => (
                <div key={tIdx} className="flex items-center gap-2">
                  <Input
                    value={topic.title}
                    onChange={(e) => updateTopic(tIdx, "title", e.target.value)}
                    placeholder="Тема"
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min={0}
                    value={topic.hours}
                    onChange={(e) => updateTopic(tIdx, "hours", Number(e.target.value))}
                    className="w-20"
                    title="Часы"
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
                <Plus /> Добавить тему
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
