import { ClipboardList, FileText, GraduationCap, Library, ListChecks, Presentation } from "lucide-react";

const features = [
  { icon: FileText, title: "КСП", format: ".docx", description: "Краткосрочный план в знакомой структуре: цель, ход урока, оценивание. Экспорт по шаблону РК." },
  { icon: ClipboardList, title: "Рабочий лист", format: "задания", description: "Задания и место для ответов к выбранному уроку. Распечатайте или раздайте в электронном виде." },
  { icon: Presentation, title: "Презентация .pptx", format: "слайды", description: "Тема, цели, задания, рефлексия — по этапам вашего урока. Скачивайте и правьте в PowerPoint." },
  { icon: ListChecks, title: "Live-квиз", format: "в классе", description: "Проверьте, что поняли ученики: вопросы по цели урока собираются вместе с планом." },
  { icon: Library, title: "Библиотека", format: "идеи", description: "Публичные планы коллег. Посмотрите, как оформлен урок, и возьмите то, что подходит вашему классу." },
  { icon: GraduationCap, title: "Учебники-RAG", format: "источники", description: "Подключите учебник: поиск по его содержанию добавит контекст к уроку. Точность и соответствие проверяете вы." },
];

export function Features() {
  return (
    <section className="notebook-bg border-y border-line py-16 md:py-20" aria-labelledby="features-title">
      <div className="notebook-shell">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-2xl">
            <p className="editorial-kicker">Лист 02 / Что в комплекте</p>
            <h2 id="features-title" className="editorial-display mt-3 text-4xl leading-tight md:text-5xl">Всё к уроку.<br /><span className="pen-underline">Ничего с нуля.</span></h2>
          </div>
          <p className="pen-note max-w-56 text-xl leading-7">Одна тема — шесть способов с ней работать.</p>
        </div>
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <li key={feature.title} className="notebook-card notebook-margin py-6 pl-11 pr-5">
              <div className="flex items-center justify-between gap-3"><feature.icon aria-hidden="true" className="size-6 text-ink" /><span className="font-mono text-[10px] uppercase tracking-wider text-graphite">0{index + 1} / {feature.format}</span></div>
              <h3 className="mt-6 text-lg font-semibold">{feature.title}</h3>
              <p className="mt-3 text-sm leading-6 text-graphite">{feature.description}</p>
            </li>
          ))}
        </ul>
        <p className="mt-8 max-w-3xl border-l-2 border-[#e06c5b] bg-background py-2 pl-4 text-sm leading-6 text-graphite"><span className="font-semibold text-foreground">Пометка учителю.</span> Сервис предлагает основу, а не заменяет вашу экспертизу. Проверяйте факты, меняйте формулировки и адаптируйте задания под свой класс.</p>
      </div>
    </section>
  );
}
