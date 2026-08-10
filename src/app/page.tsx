import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Sparkles, FileText, Users, Download } from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export default async function HomePage() {
  let signedIn = false;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = !!user;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 md:py-20 space-y-16">
      <section className="relative text-center space-y-6 overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-b from-sky-50 via-white to-white blur-3xl opacity-70"
        />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-700">
          <Sparkles className="w-3.5 h-3.5" />
          AI + ГОСО + интерактивы — всё в одном
        </span>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
          КСП за 30 секунд,
          <br />
          а не за час
        </h1>
        <p className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto">
          Конструктор краткосрочных планов урока по стандарту обновлённого
          содержания РК. С AI-помощником, библиотекой готовых планов, экспортом
          в Word и автономными интерактивами для класса.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Button asChild size="lg">
            <Link href={signedIn ? "/plans/new" : "/register"}>
              {signedIn ? "Создать КСП" : "Начать бесплатно"}
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/library">Посмотреть библиотеку</Link>
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Feature
          icon={<Sparkles className="text-blue-600" />}
          title="AI-генерация"
          text="Укажите класс, предмет и тему — AI заполнит шаблон КСП: цели, этапы урока, дифференциацию и рефлексию."
        />
        <Feature
          icon={<FileText className="text-emerald-600" />}
          title="Официальный шаблон РК"
          text="Все разделы по стандарту обновлённого содержания: цели обучения, языковые цели, ценности, критерии оценивания."
        />
        <Feature
          icon={<Download className="text-orange-600" />}
          title="Экспорт в Word и PDF"
          text="Готовый .docx и PDF для печати. Не надо вручную форматировать таблицу."
        />
        <Feature
          icon={<Users className="text-purple-600" />}
          title="Библиотека коллег"
          text="Публикуйте и копируйте готовые КСП других учителей — экономьте время на рутине."
        />
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-8 md:p-12 text-center space-y-4">
        <h2 className="text-2xl md:text-3xl font-semibold">
          Попробуйте прямо сейчас
        </h2>
        <p className="text-slate-600 max-w-xl mx-auto">
          Бесплатно. Без платёжной карты. Достаточно email, чтобы сохранить свои
          КСП.
        </p>
        <Button asChild size="lg">
          <Link href={signedIn ? "/plans/new" : "/register"}>
            {signedIn ? "Создать КСП" : "Зарегистрироваться"}
          </Link>
        </Button>
      </section>
    </div>
  );
}

function Feature({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <Card className="hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <CardHeader>
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200 flex items-center justify-center">
          {icon}
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{text}</CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  );
}
