"use client";

import { StatusLink, StatusScene, statusButtonClass } from "@/components/status/status-scene";

export default function AppError({ error, unstable_retry, reset }: {
  error: Error & { digest?: string };
  unstable_retry?: () => void;
  reset: () => void;
}) {
  return (
    <StatusScene
      kind="error"
      title="Не удалось открыть страницу"
      lead="Связь с сервером прервалась на полпути. Попробуйте ещё раз: обычно это помогает. Сохранённые уроки и материалы никуда не делись."
      code={error.digest}
    >
      <button type="button" className={statusButtonClass} onClick={() => (unstable_retry ?? reset)()}>Попробовать снова</button>
      <StatusLink href="/dashboard">На главную</StatusLink>
    </StatusScene>
  );
}
