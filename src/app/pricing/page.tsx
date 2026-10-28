import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, KeyRound } from "lucide-react";
import { getDict } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Тарифы — Mekty",
  description: "Старт — бесплатно. Pro — 2 490 ₸ в месяц, 5 990 ₸ за четверть или 19 900 ₸ в год. Школа — 9 900 ₸ в месяц до 15 учителей. Оплата Kaspi / картой, активация кодом.",
};

const faqs = [
  { question: "Подходит ли КСП под шаблон РК?", answer: "КСП оформляется в структуре шаблона РК и экспортируется в .docx: цели, этапы урока, действия учителя и учеников, оценивание. Перед использованием проверьте содержание и требования своей школы — документ можно отредактировать." },
  { question: "Можно ли готовить материалы на казахском?", answer: "Да, при подготовке урока можно выбрать казахский или русский язык. Проверьте терминологию и формулировки заданий перед тем, как раздать материалы ученикам." },
  { question: "Как оплатить: Kaspi или картой?", answer: "Оплата — через Kaspi или картой, доступ активируется кодом после оплаты. На этой странице нет формы оплаты: вводить платёжные данные здесь не нужно. Условия покупки и возврата уточните перед оплатой." },
  { question: "Куда ввести код активации?", answer: "Откройте страницу «Активировать код», войдите в аккаунт и введите полученный код. Используйте тот аккаунт, на котором хотите подключить тариф." },
];

function FeatureList({ items }: { items: string[] }) {
  return <ul className="space-y-4 text-sm leading-6 text-graphite">{items.map((item) => <li key={item} className="flex items-start gap-3"><Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" /><span>{item}</span></li>)}</ul>;
}

export default async function PricingPage() {
  const { t } = await getDict();
  const p = t.pricing;
  return (
    <div>
      <section aria-labelledby="pricing-title" className="app-hero border-b border-line py-12 md:py-16">
        <div className="app-shell">
          <div className="max-w-3xl">
            <p className="editorial-kicker">{p.kicker}</p>
            <h1 id="pricing-title" className="editorial-display mt-4 text-4xl leading-tight sm:text-5xl lg:text-6xl">{p.titleA}<br /><span className="app-underline">{p.titleB}</span></h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-graphite">{p.lead}</p>
          </div>

          <div className="mt-12 grid items-stretch gap-6 lg:grid-cols-3">
            <article aria-labelledby="start-plan" className="app-card flex flex-col p-6">
              <p className="editorial-kicker">01 / Попробовать</p>
              <h2 id="start-plan" className="editorial-display mt-5 text-3xl">{p.startPlan}</h2>
              <p className="mt-6 text-4xl font-semibold tracking-tight">0 ₸</p>
              <p className="mt-2 text-sm text-graphite">{p.startPriceNote}</p>
              <div className="my-7 border-t border-line pt-6"><FeatureList items={p.startFeatures} /></div>
              <Link href="/register" className="cta-ink mt-auto min-h-12 px-4 py-3 text-sm">{p.startCta}<ArrowRight aria-hidden="true" className="size-4" /></Link>
            </article>

            <article aria-labelledby="pro-plan" className="app-card app-pro flex flex-col p-6">
              <div><span className="pro-badge">{p.proBadge}</span></div>
              <h2 id="pro-plan" className="editorial-display mt-4 text-3xl">{p.proName} <span className="text-pro-gold">Pro</span></h2>
              <p className="mt-6"><span className="text-4xl font-semibold tracking-tight">2 490 ₸</span><span className="ml-1 text-sm text-graphite">{p.perMonth}</span></p>
              <div className="mt-4 border-l-2 border-pro-gold-bright rounded-xl bg-yellow-soft p-3 text-sm leading-6"><p className="font-semibold text-pro-gold">{p.perQuarter}</p><p className="font-semibold text-pro-gold">{p.perYear}</p><p className="mt-1 font-semibold text-pro-gold">{p.perYearNote}</p><p className="mt-1 text-xs leading-5 text-graphite">{p.perYearSave}</p></div>
              <div className="my-7 border-t border-line pt-6"><FeatureList items={p.proFeatures} /></div>
              <Link href="/redeem" className="cta-ink mt-auto min-h-12 px-4 py-3 text-sm"><KeyRound aria-hidden="true" className="size-4" />{p.activateCode}</Link>
            </article>

            <article aria-labelledby="school-plan" className="app-card flex flex-col p-6">
              <p className="editorial-kicker">{p.schoolKicker}</p>
              <h2 id="school-plan" className="editorial-display mt-5 text-3xl">{p.schoolName}</h2>
              <p className="mt-6"><span className="text-2xl font-semibold tracking-tight text-graphite">Скоро</span></p>
              <p className="mt-2 text-sm text-graphite">{p.schoolPerTeacher}</p>
              <div className="my-7 border-t border-line pt-6"><p className="text-sm leading-6 text-graphite">{p.schoolText}</p><p className="app-note mt-6 text-xl">{p.schoolSlogan}</p></div>
              <div className="mt-auto border-t border-line pt-5"><p className="font-semibold text-ink">{p.schoolTitle}</p><p className="mt-2 text-sm leading-6 text-graphite">{p.schoolNote}</p></div>
            </article>
          </div>

          <div className="mt-8 flex flex-col gap-3 border-y border-line bg-background px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-graphite">{p.payNote}</p>
            <Link href="/redeem" className="editorial-link inline-flex items-center gap-2 py-2 font-medium"><KeyRound aria-hidden="true" className="size-4" />{p.activateCode}</Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="faq-title" className="app-shell grid gap-8 py-16 md:grid-cols-[1fr_2fr] md:gap-12 md:py-20">
        <div><p className="editorial-kicker">{p.faqKicker}</p><h2 id="faq-title" className="editorial-display mt-3 text-4xl leading-tight">{p.faqTitle}</h2><p className="app-note mt-5 text-lg">{p.faqNote}</p></div>
        <div className="app-card divide-y divide-line px-5 sm:px-7">{faqs.map((faq, index) => <details key={faq.question} className="group py-5"><summary className="cursor-pointer rounded-sm pr-2 text-base font-semibold leading-7 marker:text-primary"><span aria-hidden="true" className="mr-3 font-mono text-xs text-ink">0{index + 1}</span>{faq.question}</summary><p className="mt-3 text-sm leading-7 text-graphite">{faq.answer}</p></details>)}</div>
      </section>

      <section aria-label="Начать работу" className="app-shell pb-16">
        <div className="flex flex-wrap items-center justify-between gap-5 border-t border-brand-cyan pt-7"><p className="editorial-display text-2xl leading-tight">{p.ctaTitle}</p><Link href="/register" className="cta-ink min-h-12 px-6 py-3 text-sm">{p.ctaButton}<ArrowRight aria-hidden="true" className="size-4" /></Link></div>
      </section>
    </div>
  );
}
