"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Одноразовое наполнение школы демо-данными (директор). */
export function SeedButton({ schoolId }: { schoolId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function seed() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/school/${schoolId}/seed`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Не удалось наполнить данными");
        setPending(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Сеть недоступна");
    }
    setPending(false);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button onClick={() => void seed()} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {pending ? "Наполняю школу данными…" : "Наполнить демо-данными"}
      </Button>
      <p className="max-w-sm text-center text-xs text-muted-foreground">
        30 учителей, 500 учеников, посещаемость за сентябрь, оценки СОР, прогресс КТП и проверки ВШК — чтобы все разделы ожили.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
