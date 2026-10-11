"use client";

import { useEffect } from "react";

export default function SchoolError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("School workspace failed to load", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center gap-3 px-5 text-center">
      <h1 className="text-xl font-semibold">Не удалось загрузить данные школы</h1>
      <p className="text-sm text-muted-foreground">Данные не заменены пустым списком. Проверьте соединение и повторите загрузку.</p>
      <button type="button" onClick={retry} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Повторить</button>
    </main>
  );
}
