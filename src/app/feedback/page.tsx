import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "Обратная связь — Mekty" };

const faqs = [
  {
    q: "Как создать первый КСП?",
    a: "Зарегистрируйтесь, перейдите в раздел «Мои планы» и нажмите «Новый КСП». Введите тему, выберите предмет и класс — остальное сделает AI.",
  },
  {
    q: "Сколько КСП я могу создать бесплатно?",
    a: "На бесплатном тарифе доступно 3 КСП в месяц. Для безлимитного доступа подключите Pro-тариф.",
  },
  {
    q: "Как экспортировать план в Word?",
    a: "Откройте готовый план и нажмите кнопку «Экспорт» в правом верхнем углу. Выберите формат Word и скачайте файл.",
  },
  {
    q: "Можно ли использовать Mekty без регистрации?",
    a: "Для создания и сохранения планов нужна регистрация. Но просмотр библиотеки и использование материалов по QR-коду доступны без входа.",
  },
  {
    q: "Как связаться с поддержкой?",
    a: "Напишите нам на support@mekty.kz или оставьте отзыв через форму на этой странице. Мы отвечаем в течение рабочего дня.",
  },
];

export default async function FeedbackPage() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <header className="text-center">
        <p className="editorial-kicker">Mekty</p>
        <h1 className="editorial-display mt-3 text-4xl">Обратная связь</h1>
        <p className="mt-3 text-muted-foreground">
          Помогите нам стать лучше — расскажите, что думаете о Mekty.
        </p>
      </header>

      {/* Feedback Form */}
      <section className="mt-10 rounded-xl border border-border bg-surface p-6 md:p-8">
        {user ? (
          <FeedbackForm userId={user.id} />
        ) : (
          <div className="text-center">
            <p className="text-muted-foreground">
              Войдите, чтобы оставить отзыв.
            </p>
            <Button asChild className="mt-4">
              <Link href="/login?next=/feedback">Войти</Link>
            </Button>
          </div>
        )}
      </section>

      {/* FAQ Section */}
      <section className="mt-16" aria-labelledby="faq-title">
        <h2 id="faq-title" className="text-2xl font-semibold">Частые вопросы</h2>
        <div className="mt-6 space-y-4">
          {faqs.map((faq) => (
            <details
              key={faq.q}
              className="group rounded-xl border border-border bg-surface p-4"
            >
              <summary className="cursor-pointer font-medium transition-colors group-open:text-primary">
                {faq.q}
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Contact Info */}
      <section className="mt-16" aria-labelledby="contact-title">
        <h2 id="contact-title" className="text-2xl font-semibold">Контакты</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-4">
            <h3 className="font-medium">Email</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              <a href="mailto:support@mekty.kz" className="text-primary hover:underline">
                support@mekty.kz
              </a>
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <h3 className="font-medium">Документация</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              <Link href="/library" className="text-primary hover:underline">
                Открыть библиотеку
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
