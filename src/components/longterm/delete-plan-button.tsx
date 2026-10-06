"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Кнопка удаления плана (ДСП/ССП) из серверной страницы: confirm и вызов
 * DELETE-эндпоинта возможны только на клиенте — onClick в Server Component
 * уронил бы рендер страницы.
 */
export function DeletePlanButton({ endpoint, id, confirmText, fallbackHref }: {
  endpoint: string;
  id: string;
  confirmText: string;
  fallbackHref: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onDelete() {
    if (pending || !window.confirm(confirmText)) return;
    setPending(true);
    try {
      const res = await fetch(`${endpoint}?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      router.push(fallbackHref);
      router.refresh();
    } catch {
      setPending(false);
    }
  }

  return (
    <Button variant="destructive" onClick={() => void onDelete()} disabled={pending} aria-label="Удалить">
      <Trash2 />
    </Button>
  );
}
