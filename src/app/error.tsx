"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AppError({ unstable_retry, reset }: {
  error: Error & { digest?: string };
  unstable_retry?: () => void;
  reset: () => void;
}) {
  return <section role="alert" className="mx-auto max-w-2xl px-4 py-20 text-center">
    <p className="editorial-kicker">Mekty · временная ошибка</p>
    <h1 className="mt-4 text-4xl font-bold">Не удалось открыть страницу</h1>
    <p className="mt-4 leading-7 text-muted-foreground">Попробуйте ещё раз. Если ошибка повторится, вернитесь к своим планам. Несохранённые изменения могут потребовать повторного ввода.</p>
    <div className="mt-8 flex flex-wrap justify-center gap-3">
      <Button onClick={() => (unstable_retry ?? reset)()}>Попробовать снова</Button>
      <Button asChild variant="outline"><Link href="/dashboard">Мои планы</Link></Button>
    </div>
  </section>;
}
