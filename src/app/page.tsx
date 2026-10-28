import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, Bot, Check, FileText, Languages, Layers, Leaf, PencilLine, Presentation, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { KitPreview, PlantIllustration } from "@/components/landing/kit-preview";
import s from "@/components/landing/landing.module.css";

export default async function HomePage() {
  const signedIn = Boolean(await getCurrentUser());
  const { t } = await getDict();
  const l = t.landing;
  const createHref = signedIn ? "/plans/new" : "/register";
  const createLabel = signedIn ? l.createNew : l.createFirst;
  // Длинные FAQ-ответы — следующий этап перевода, пока RU.
  const faqs = [
    { question: "Это готовый урок или черновик?", answer: "Это основа для вашей работы: план, задания и слайды. Перед уроком проверьте факты, цели обучения, сложность заданий и хронометраж. ИИ помогает с подготовкой, но не заменяет профессиональное решение учителя." },
    { question: "Можно готовить материалы на казахском?", answer: "Да. При создании плана выберите казахский или русский язык. Перед использованием проверьте предметную терминологию и формулировки заданий." },
    { question: "Что входит в бесплатный тариф?", answer: "3 КСП в месяц, рабочие листы с водяным знаком и базовый квиз. ИИ-иллюстрации доступны в Pro. Для регистрации не требуется банковская карта." },
    { question: "Можно редактировать и распечатать материалы?", answer: "Да. План можно доработать в редакторе и скачать в Word, презентацию — в PowerPoint. Рабочие листы и карточки подходят для печати. Содержание и требования школы нужно проверить перед использованием." },
  ];
  const benefitIcons = [BookOpen, Languages, FileText, PencilLine];
  const featureIcons = [BookOpen, Languages, Layers, Presentation, PencilLine, FileText];
  return <div className={s.landing}>
    <section className={s.hero} aria-labelledby="hero-title">
      <div className={`${s.shell} ${s.heroGrid}`}>
        <div className={s.heroCopy}>
          <div className={s.eyebrow}>{l.eyebrow}</div>
          <h1 id="hero-title">{l.heroA}<br />{l.heroB} <span className={s.accent}>{l.heroC}<svg viewBox="0 0 300 18" fill="none" aria-hidden="true"><path d="M4 12C80 2 180 2 294 10" stroke="currentColor" strokeWidth={7} strokeLinecap="round" /></svg></span></h1>
          <p className={s.heroLead}>{l.heroLeadA}<br />{l.heroLeadB}</p>
          <div className={s.heroActions}><Link className={s.primary} href={createHref}>{createLabel}<ArrowUpRight size={19} /></Link><a className={s.textAction} href="#kit"><span className={s.playCircle}><ArrowDown size={16} /></span>{l.whatYouGet}</a></div>
          <div className={s.heroFine}><Check size={15} /><span>{l.freeNoteA}</span><span className={s.fineDivider} /><span>{l.freeNoteB}</span></div>
        </div>
        <div className={s.heroVisual}>
          <KitPreview />
          {/* Декоративные метки: названия продуктов одинаковы на русском и казахском. */}
          <div className={`${s.floatChip} ${s.chipA}`} aria-hidden="true"><span><Bot size={15} /></span>BilimClass<Check size={14} /></div>
          <div className={`${s.floatChip} ${s.chipB}`} aria-hidden="true"><span><Sparkles size={15} /></span>КСП · СОР · СОЧ</div>
          <div className={`${s.floatChip} ${s.chipC}`} aria-hidden="true"><span><FileText size={15} /></span>.docx · .pptx</div>
        </div>
      </div>
    </section>

    <div className={s.benefitStrip}><div className={s.shell}>{l.benefits.map((b, i) => {
      const Icon = benefitIcons[i] ?? BookOpen;
      return <span key={b}><Icon />{b}</span>;
    })}</div></div>

    <section id="kit" className={`${s.shell} ${s.section}`} aria-labelledby="kit-title">
      <div className={s.sectionHeading}><div><p className={s.kicker}>{l.kitKicker}</p><h2 id="kit-title">{l.kitTitleA}<br /><span>{l.kitTitleB}</span></h2></div><p>{l.kitLead}</p></div>
      <div className={s.kitGrid}>
        <article className={`${s.kitCard} ${s.planCard}`}><div className={s.cardHeading}><span className={s.squareIcon}><FileText size={21} /></span><span className={s.fileBadge}>.DOCX</span></div><h3>План, в котором есть смысл</h3><p>Цели, ход урока, действия учеников и оценивание. Структура, на которую можно опереться.</p><div className={s.planMock} aria-hidden="true"><div className={s.mockLabel}>ХОД УРОКА <span>40 МИН</span></div><div><i /><span>Начало урока</span><b>05</b></div><div><i /><span>Исследование и практика</span><b>25</b></div><div><i /><span>Рефлексия</span><b>10</b></div><footer><Check size={13} /> У каждого этапа — своя цель</footer></div></article>
        <article className={`${s.kitCard} ${s.sheetCard}`}><div className={s.cardHeading}><span className={s.squareIcon}><Layers size={21} /></span><span className={s.fileBadge}>НА ПЕЧАТЬ</span></div><h3>Задания, а не стены текста</h3><p>Рабочие листы и карточки с местом для ответов. ИИ-иллюстрации — в тарифе Pro.</p><div className={s.sheetMock}><div><span>ИССЛЕДУЕМ ПРИРОДУ</span><b>Что помогает<br />растению жить?</b></div><PlantIllustration /><div className={s.answerLine}>Моё открытие <i /></div></div></article>
        <article className={`${s.kitCard} ${s.slidesCard}`}><div className={s.cardHeading}><span className={s.squareIcon}><Presentation size={21} /></span><span className={s.fileBadge}>.PPTX</span></div><h3>Слайды, которые помогают</h3><p>Основные мысли, вопросы для класса и понятная последовательность. Откройте и доработайте в PowerPoint.</p><div className={s.slidesMock}><div><span>03 / ОБСУЖДАЕМ ВМЕСТЕ</span><b>А что, если<br />исчезнут листья?</b><span className={s.slideLeaf}><Leaf size={62} strokeWidth={1.1} /></span><small>Подумай. Обсуди. Объясни.</small></div><footer><i /><i /><i className={s.dotSelected} /><i /><i /><span>3 / 8</span></footer></div></article>
      </div>
      <p className={s.demoCaption}>{l.demoCaption}</p>
    </section>

    <section className={s.processSection} id="how" aria-labelledby="how-title"><div className={`${s.shell} ${s.section}`}><div className={s.sectionHeading}><div><p className={s.kicker}>{l.howKicker}</p><h2 id="how-title">{l.howTitleA}<br />{l.howTitleB}</h2></div></div><ol className={s.steps}>{l.steps.map(({ title, text }, i) => <li key={title}><span className={s.stepNum}>0{i + 1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol></div></section>

    <section className={s.featuresSection} aria-labelledby="features-title"><div className={`${s.shell} ${s.section}`}><div className={s.sectionHeading}><div><p className={s.kicker}>{l.featuresKicker}</p><h2 id="features-title">{l.featuresTitleA}<br /><span>{l.featuresTitleB}</span></h2></div><p>{l.featuresLead}</p></div><div className={s.featuresGrid}>{l.features.map(({ title, text }, i) => { const Icon = featureIcons[i] ?? BookOpen; return <article key={title} className={s.featureCard}><div className={s.featureIcon}><Icon size={24} /></div><h3>{title}</h3><p>{text}</p></article>; })}</div></div></section>

    <section className={`${s.shell} ${s.section}`} aria-labelledby="teacher-title"><div className={s.teacherPanel}><div className={s.teacherArt} aria-hidden="true"><span className={s.artKicker}>{l.teacherArt}</span><div className={s.bookOne}>{l.teacherBook}<span>Mekty</span></div><div className={s.artScribble}>{l.teacherScribbleA}<br />{l.teacherScribbleB}</div><div className={s.sunDisc}><b>{l.teacherIdeas}</b></div></div><div className={s.teacherCopy}><p className={s.kicker}>{l.teacherKicker}</p><h2 id="teacher-title">{l.teacherTitleA}<br />{l.teacherTitleB}<br /><span>{l.teacherTitleC}</span></h2><p>{l.teacherText}</p><ul>{l.teacherBullets.map((b) => <li key={b}><Check />{b}</li>)}</ul><Link href={createHref} className={s.textAction}>{l.tryTopic}<ArrowRight size={18} /></Link></div></div></section>

    <section className={`${s.shell} ${s.pricingSection}`} aria-labelledby="plans-title"><div className={s.sectionHeading}><div><p className={s.kicker}>{l.plansKicker}</p><h2 id="plans-title">{l.plansTitle}</h2></div><Link href="/pricing" className={s.textAction}>{l.allTariffs}<ArrowUpRight size={18} /></Link></div><div className={s.pricingGrid}><article className={s.freePlan}><div><span className={s.planEyebrow}>ПОЗНАКОМИТЬСЯ</span><h3>Старт</h3><p>Попробуйте на ближайшем уроке.</p></div><div className={s.price}>0 ₸<span>без карты</span></div><ul><li><Check />3 КСП в месяц</li><li><Check />Рабочие листы с водяным знаком</li><li><Check />Базовый квиз</li></ul><Link href={createHref} className={s.secondary}>Начать бесплатно<ArrowRight size={17} /></Link></article><article className={s.proPlan}><div><span className={s.planEyebrow}>ДЛЯ РЕГУЛЯРНОЙ ПОДГОТОВКИ</span><h3>Учитель <span>Pro</span></h3><p>Больше свободы для ваших идей.</p></div><div className={s.price}>2 490 ₸<span>в месяц</span></div><ul><li><Check />КСП без жёсткой квоты · ориентир 60/мес.</li><li><Check />Материалы без водяного знака</li><li><Check />50 ИИ-иллюстраций в месяц</li></ul><Link href="/pricing" className={s.primary}>Подробнее о Pro<ArrowUpRight size={18} /></Link></article></div></section>

    <section className={`${s.shell} ${s.section} ${s.faqSection}`} aria-labelledby="faq-title"><div><p className={s.kicker}>{l.faqKicker}</p><h2 id="faq-title">{l.faqTitle}</h2></div><div className={s.faqList}>{faqs.map(({ question, answer }, index) => <details key={question}><summary><span className={s.faqNumber}>0{index + 1}</span>{question}<span className={s.faqPlus} aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>

    <section className={s.finalCta} aria-labelledby="start-title"><div className={s.shell}><div className={s.ctaBox}><p className={s.kicker}>{l.finalKicker}</p><h2 id="start-title">{l.finalTitleA}<br /><span>{l.finalTitleB}</span></h2><p>{l.finalText}</p><Link href={createHref} className={s.primary}>{createLabel}<ArrowUpRight size={20} /></Link><span className={s.ctaNote}>{l.finalNote}</span></div></div></section>
  </div>;
}
