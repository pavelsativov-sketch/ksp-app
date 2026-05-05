/**
 * Read-only render of an AssessmentPaper. Shows the student-facing layout
 * (header, instructions, tasks) followed by the teacher-only block
 * (criteria, descriptors, answer keys, grade boundaries).
 */
import type { AssessmentPaperRow } from "@/lib/types/assessment";

const TASK_TYPE_LABEL: Record<string, string> = {
  open: "Развёрнутый ответ",
  test: "Тест",
  match: "Соответствие",
  fill: "Пропуски",
  essay: "Эссе",
};

export function AssessmentView({ paper }: { paper: AssessmentPaperRow }) {
  const c = paper.content;
  const total = c.tasks.reduce((s, t) => s + (t.points || 0), 0);
  const kindLabel =
    paper.kind === "sor"
      ? "Суммативное оценивание за раздел (СОР)"
      : "Суммативное оценивание за четверть (СОЧ)";

  return (
    <div className="print-plan bg-white border border-slate-200 rounded-lg p-3 sm:p-6 md:p-8 space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">{paper.title}</h1>
        <p className="text-sm text-slate-500 mt-1">{kindLabel}</p>
      </div>

      <table className="w-full text-sm table-fixed">
        <tbody>
          <Row label="Школа" value={c.header.school} />
          <Row label="ФИО учителя" value={c.header.teacherName} />
          <Row label="Класс" value={c.header.grade || String(paper.grade)} />
          <Row label="Дата" value={c.header.date} />
          <Row
            label={paper.kind === "sor" ? "Раздел" : "Разделы"}
            value={c.sections.join("; ") || paper.section || "—"}
          />
          <Row
            label="Длительность"
            value={`${c.durationMinutes ?? paper.duration_minutes ?? 40} минут`}
          />
          <Row label="Максимальный балл" value={String(total)} />
        </tbody>
      </table>

      {c.instructions && (
        <Section title="Инструкция для ученика">
          <p className="whitespace-pre-wrap">{c.instructions}</p>
        </Section>
      )}

      {c.learningObjectives.length > 0 && (
        <Section title="Цели обучения">
          <ul className="list-disc pl-6 space-y-1">
            {c.learningObjectives.map((o, i) => (
              <li key={i}>
                <span className="font-mono text-slate-600">{o.code}</span> —{" "}
                {o.text}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Задания">
        <ol className="space-y-4 list-decimal pl-6">
          {c.tasks.map((t) => (
            <li key={t.number} className="space-y-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-medium">
                  Задание {t.number}.
                </span>
                <span className="text-xs text-slate-500">
                  [{TASK_TYPE_LABEL[t.type] ?? t.type}] · {t.learningObjectiveCode} ·{" "}
                  {t.points}{" "}
                  {pluralPoints(t.points)}
                </span>
              </div>
              <p className="whitespace-pre-wrap">{t.text}</p>
              {t.descriptors.length > 0 && (
                <details className="mt-1 text-xs">
                  <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
                    Дескрипторы оценивания
                  </summary>
                  <ul className="list-disc pl-5 mt-1 space-y-0.5 text-slate-700">
                    {t.descriptors.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          ))}
        </ol>
      </Section>

      {c.criteria.length > 0 && (
        <Section title="Критерии оценивания">
          <table className="w-full text-sm border border-slate-300">
            <thead>
              <tr className="bg-slate-50">
                <th className="border border-slate-300 px-2 py-1.5 text-left w-24">
                  Код
                </th>
                <th className="border border-slate-300 px-2 py-1.5 text-left">
                  Критерий
                </th>
                <th className="border border-slate-300 px-2 py-1.5 text-left w-32">
                  Задания
                </th>
              </tr>
            </thead>
            <tbody>
              {c.criteria.map((cr, i) => (
                <tr key={i} className="border-b border-slate-200 last:border-b-0">
                  <td className="border border-slate-200 px-2 py-1.5 align-top font-mono">
                    {cr.code}
                  </td>
                  <td className="border border-slate-200 px-2 py-1.5 align-top">
                    {cr.descriptor}
                  </td>
                  <td className="border border-slate-200 px-2 py-1.5 align-top text-slate-600">
                    {cr.taskNumbers.join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {c.gradeBoundaries.length > 0 && (
        <Section title="Шкала перевода в 5-балльную оценку">
          <table className="w-full text-sm border border-slate-300 max-w-md">
            <thead>
              <tr className="bg-slate-50">
                <th className="border border-slate-300 px-3 py-1.5 text-center w-24">
                  Оценка
                </th>
                <th className="border border-slate-300 px-3 py-1.5 text-left">
                  Баллов
                </th>
              </tr>
            </thead>
            <tbody>
              {[...c.gradeBoundaries]
                .sort((a, b) => b.grade - a.grade)
                .map((b) => (
                  <tr
                    key={b.grade}
                    className="border-b border-slate-200 last:border-b-0"
                  >
                    <td className="border border-slate-200 px-3 py-1.5 text-center font-bold">
                      {b.grade}
                    </td>
                    <td className="border border-slate-200 px-3 py-1.5">
                      {b.minPoints}–{b.maxPoints}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Section>
      )}

      <Section title="Ключи (для учителя)">
        <ol className="space-y-3 list-decimal pl-6 text-sm">
          {c.tasks.map((t) => (
            <li key={t.number}>
              <p className="font-medium">Задание {t.number}.</p>
              <p className="whitespace-pre-wrap text-slate-700">
                {t.answerKey || "—"}
              </p>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-slate-200">
      <td className="py-1.5 pr-3 text-slate-500 w-2/5 sm:w-1/3 align-top text-xs sm:text-sm">
        {label}
      </td>
      <td className="py-1.5 align-top break-words">{value || "—"}</td>
    </tr>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold border-b border-slate-200 pb-1">
        {title}
      </h2>
      <div className="text-sm space-y-1">{children}</div>
    </section>
  );
}

function pluralPoints(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "балл";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "балла";
  return "баллов";
}
