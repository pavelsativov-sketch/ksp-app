import { FileText, Presentation, Rows3 } from "lucide-react";

export function LessonPreview() {
  return (
    <figure aria-labelledby="lesson-preview-title" className="notebook-card notebook-spiral px-4 pb-5 sm:px-6 sm:pb-6">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <span className="editorial-kicker">Краткосрочный план</span>
        <span className="font-mono text-[10px] text-graphite">ОБРАЗЕЦ / 01</span>
      </figcaption>
      <div className="mt-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-graphite">Математика · 5 класс</p>
          <h2 id="lesson-preview-title" className="editorial-display mt-2 text-2xl leading-tight">Сложение натуральных чисел</h2>
        </div>
        <span aria-hidden="true" className="pen-note pt-1 text-xl">§ 1</span>
      </div>
      <dl className="my-5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs leading-5">
        <dt className="font-semibold">Раздел</dt><dd className="text-graphite">Натуральные числа и нуль</dd>
        <dt className="font-semibold">Цель урока</dt><dd className="text-graphite">Применять сложение в учебных и жизненных задачах.</dd>
      </dl>
      <table className="lesson-table">
        <caption className="sr-only">Фрагмент хода урока: этапы, действия и оценивание</caption>
        <colgroup><col className="w-[24%]" /><col className="w-[49%]" /><col className="w-[27%]" /></colgroup>
        <thead><tr><th scope="col">Этап / время</th><th scope="col">Действия учителя и учеников</th><th scope="col">Оценивание</th></tr></thead>
        <tbody>
          <tr><th scope="row" className="font-medium">Начало<br /><span className="font-mono text-graphite">5 мин</span></th><td>Вспоминаем слагаемые и сумму. Объясняем решение устно.</td><td>Устная обратная связь</td></tr>
          <tr><th scope="row" className="font-medium">Середина<br /><span className="font-mono text-graphite">25 мин</span></th><td>В парах: в библиотеку привезли 245 учебников и 138 сборников. Сколько всего?</td><td>Объясняет выбор действия</td></tr>
          <tr><th scope="row" className="font-medium">Конец<br /><span className="font-mono text-graphite">10 мин</span></th><td>Составляем свою задачу. Обсуждаем, что получилось.</td><td>Самооценка</td></tr>
        </tbody>
      </table>
      <p className="pen-note mt-3 text-sm">На полях: дайте детям придумать свой пример.</p>
      <ul aria-label="Материалы комплекта" className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4 text-[11px] text-ink">
        <li className="flex flex-col gap-2"><FileText aria-hidden="true" className="size-4" />КСП · .docx</li>
        <li className="flex flex-col gap-2"><Rows3 aria-hidden="true" className="size-4" />Рабочий лист</li>
        <li className="flex flex-col gap-2"><Presentation aria-hidden="true" className="size-4" />Слайды · .pptx</li>
      </ul>
      <p className="mt-4 text-[11px] leading-5 text-graphite">Иллюстрация структуры, не готовый урок. Содержание проверяет учитель.</p>
    </figure>
  );
}
