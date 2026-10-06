import Link from "next/link";
import { School } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Экран для пользователя без школы: создать или подключиться по коду. */
export function NoSchool() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary-soft text-primary">
        <School className="size-8" />
      </div>
      <h1 className="editorial-display mt-4 text-3xl">Школа не подключена</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        Создайте школу или присоединитесь по коду директора — тогда появятся ученики, посещаемость, успеваемость и ВШК.
      </p>
      <Button asChild className="mt-5">
        <Link href="/school/create">Создать / подключить школу</Link>
      </Button>
    </main>
  );
}
