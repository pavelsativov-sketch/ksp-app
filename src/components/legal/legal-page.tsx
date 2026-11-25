import Link from "next/link";

/** Реквизиты оператора. Пока не заполнены владельцем — показываются как явные заглушки. */
export const OPERATOR = {
  name: "[НАИМЕНОВАНИЕ ОПЕРАТОРА — заполнить]",
  bin: "[БИН/ИИН — заполнить]",
  address: "[ЮРИДИЧЕСКИЙ АДРЕС — заполнить]",
  email: "[EMAIL ДЛЯ ОБРАЩЕНИЙ — заполнить]",
} as const;

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="app-shell py-12 md:py-16">
      <article className="mx-auto max-w-3xl">
        <p className="editorial-kicker">Mekty · правовые документы</p>
        <h1 className="editorial-display mt-4 text-3xl leading-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm text-graphite">Редакция от {updated}</p>
        <div role="note" className="mt-6 rounded-xl border border-line bg-muted p-4 text-sm leading-6">
          <b>Шаблон документа.</b> Текст подготовлен как шаблон и должен быть проверен юристом до публичного запуска.
          Значения в квадратных скобках — заглушки: оператор должен указать свои реквизиты.
        </div>
        <div className="mt-8 space-y-4 text-base leading-7 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6 [&_a]:underline">
          {children}
        </div>
        <p className="mt-12 text-sm text-graphite">
          <Link href="/privacy" className="underline">Политика конфиденциальности</Link> · <Link href="/terms" className="underline">Пользовательское соглашение</Link>
        </p>
      </article>
    </div>
  );
}
