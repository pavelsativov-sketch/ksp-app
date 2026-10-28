import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AiHistoryClient } from "./history-client";

export const dynamic = "force-dynamic";

export default async function AiHistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/ai/history");
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-6">
      <header className="border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI · История</p>
        <h1 className="mt-2 text-2xl font-bold">История запросов AI</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Хранится 90 дней (TTL). Каждая запись — модель, schema_version, source_ids и хеш параметров. Текст домашнего задания не сохраняется.
          Повтор — только предпросмотр, план не перезаписывается без подтверждения.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">Доступ — только владелец или завуч/директор той же школы.</p>
      </header>
      <AiHistoryClient />
    </div>
  );
}
