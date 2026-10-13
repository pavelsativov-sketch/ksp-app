"use client";

import { useState } from "react";
import type { LessonPlanRow, LessonStage } from "@/lib/types/ksp";
import { TaskPlayer } from "./task-player";
import { QuizMode } from "./quiz-mode";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { taskTypeLabel } from "@/lib/ksp/tasks";

export function PlanView({ plan }: { plan: LessonPlanRow }) {
  const c = plan.content;
  const [quizOpen, setQuizOpen] = useState(false);
  const totalTasks =
    (c.stages.beginning.tasks?.length ?? 0) +
    (c.stages.middle.tasks?.length ?? 0) +
    (c.stages.end.tasks?.length ?? 0);
  const headerItems: Array<[string, string]> = [
    ["Раздел долгосрочного плана", c.header.longTermPlanSection],
    ["Школа", c.header.school],
    ["Дата", c.header.date],
    ["ФИО учителя", c.header.teacherName],
    ["Класс", c.header.grade || String(plan.grade)],
    ["Присутствовало / Отсутствовало", `${c.header.studentsPresent ?? "—"} / ${c.header.studentsAbsent ?? "—"}`],
    ["Тема урока", c.topic],
  ];
  return (
    <div className="print-plan space-y-8 rounded-2xl border border-[#ddd5cb] bg-surface p-5 md:p-8">
      <div className="border-b border-[#ddd5cb] pb-5 text-center"><p className="editorial-kicker">Краткосрочный план урока</p><h2 className="editorial-display mt-3 break-words text-3xl sm:text-4xl">{plan.title}</h2></div>

      {totalTasks > 0 && (
        <div className="no-print flex justify-center">
          <Button
            type="button"
            size="lg"
            onClick={() => setQuizOpen(true)}
            className="bg-[#17202b] hover:bg-[#17202b]"
          >
            <Sparkles className="w-5 h-5" />
            Пройти урок как квиз ({totalTasks} заданий)
          </Button>
        </div>
      )}

      {quizOpen && (
        <QuizMode
          stages={[
            { stageKey: "beginning", stageTitle: "Начало урока", tasks: c.stages.beginning.tasks ?? [] },
            { stageKey: "middle", stageTitle: "Середина урока", tasks: c.stages.middle.tasks ?? [] },
            { stageKey: "end", stageTitle: "Конец урока", tasks: c.stages.end.tasks ?? [] },
          ]}
          onClose={() => setQuizOpen(false)}
        />
      )}

      <div className="hidden overflow-x-auto border-y border-[#ddd5cb] sm:block"><table className="w-full min-w-[560px] text-sm"><tbody>
          {headerItems.map(([label, value]) => <TableRow key={label} label={label} value={value} />)}
        </tbody></table></div>
      <dl className="grid gap-2 border-y border-[#ddd5cb] py-3 sm:hidden">
        {headerItems.map(([label, value]) => <div key={label} className="rounded-lg bg-muted/40 px-3 py-2">
          <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 break-words text-sm">{value || "—"}</dd>
        </div>)}
      </dl>

      <Section title="Цели обучения">
        {c.learningObjectives.length > 0 ? (
          <ul className="list-disc pl-6 space-y-1">
            {c.learningObjectives.map((o, i) => (
              <li key={o.code || i}>
                {o.code && <span className="font-mono text-slate-600">{o.code} — </span>}
                {o.text}
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        )}
      </Section>

      <Section title="Цели урока">
        <BulletList items={c.lessonObjectives} />
      </Section>

      <Section title="Критерии оценивания">
        <BulletList items={c.assessmentCriteria} />
      </Section>

      <Section title="Языковые цели">
        <p>
          <strong>Термины: </strong>
          {c.languageObjectives.terms.join(", ") || "—"}
        </p>
        <p>
          <strong>Ключевые фразы: </strong>
          {c.languageObjectives.phrases.join("; ") || "—"}
        </p>
      </Section>

      <Section title="Привитие ценностей">
        <p>{c.values || "—"}</p>
      </Section>

      <Section title="Межпредметные связи">
        <p>{c.crossCurricularLinks || "—"}</p>
      </Section>

      <Section title="Предшествующие знания">
        <p>{c.priorKnowledge || "—"}</p>
      </Section>

      <Section title="Ход урока">
        <StageTable title="Начало урока" stage={c.stages.beginning} />
        <StageTable title="Середина урока" stage={c.stages.middle} />
        <StageTable title="Конец урока" stage={c.stages.end} />
      </Section>

      <Section title="Оценивание и рефлексия">
        <p>
          <strong>Формативное оценивание: </strong>
          {c.evaluation.formativeAssessment || "—"}
        </p>
        <p>
          <strong>Дифференциация: </strong>
          {c.evaluation.differentiation || "—"}
        </p>
        <p>
          <strong>Здоровье и ТБ: </strong>
          {c.evaluation.healthAndSafety || "—"}
        </p>
        <p>
          <strong>Рефлексия: </strong>
          {c.evaluation.reflection || "—"}
        </p>
      </Section>
    </div>
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
      <h2 className="editorial-display border-b border-[#ddd5cb] pb-2 text-2xl">
        {title}
      </h2>
      <div className="break-words text-sm space-y-1">{children}</div>
    </section>
  );
}

function TableRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-[#eee7de]">
      <td className="w-1/3 py-2.5 pr-3 font-medium text-[#5f5751] align-top">{label}</td>
      <td className="py-1.5 align-top">{value || "—"}</td>
    </tr>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return <Empty />;
  return (
    <ul className="list-disc pl-6 space-y-1">
      {items.map((x, i) => (
        <li key={`${x.slice(0, 30)}_${i}`}>{x}</li>
      ))}
    </ul>
  );
}

function Empty() {
  return <p className="text-slate-400 italic">—</p>;
}

function StageTable({
  title,
  stage,
}: {
  title: string;
  stage: LessonStage;
}) {
  const tasks = stage.tasks ?? [];
  return (
    <div className="space-y-2">
      <h3 className="mt-5 border-l-2 border-[#1e4f91] pl-3 font-bold">{title}</h3>
      <StageBody stage={stage} />
      {tasks.length > 0 && (
        <div className="mt-3 space-y-2 no-print">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Интерактивные задания этапа ({tasks.length})
          </p>
          {tasks.map((task) => (
            <div
              key={task.id}
              className="border border-[#d9d1c3] bg-[#f8f4eb] p-4"
            >
              <TaskPlayer task={task} />
            </div>
          ))}
        </div>
      )}
      {tasks.length > 0 && (
        <div className="hidden print:block text-xs space-y-1">
          <p className="font-medium">Интерактивные задания:</p>
          <ol className="list-decimal pl-5 space-y-1">
            {tasks.map((t) => (
              <li key={t.id}>
                <span className="text-slate-600">[{taskTypeLabel(t.type)}]</span>{" "}
                {t.question}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function StageBody({ stage }: { stage: LessonStage }) {
  const rows: Array<[string, string]> = [
    ["Время", stage.time],
    ["Действия учителя", stage.teacherActions],
    ["Действия учеников", stage.studentActions],
    ["Ресурсы", stage.resources],
  ];
  return (
    <>
    <div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[620px] text-sm border border-[#cfc5b5]">
      <thead>
        <tr className="bg-[#ebe3d4]">
          <th className="w-[15%] border border-[#cfc5b5] p-2 text-left">Время</th>
          <th className="w-[40%] border border-[#cfc5b5] p-2 text-left">Действия учителя</th>
          <th className="w-[30%] border border-[#cfc5b5] p-2 text-left">Действия учеников</th>
          <th className="w-[15%] border border-[#cfc5b5] p-2 text-left">Ресурсы</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="border border-slate-300 p-2 align-top whitespace-pre-wrap">{stage.time || "—"}</td>
          <td className="border border-slate-300 p-2 align-top whitespace-pre-wrap">{stage.teacherActions || "—"}</td>
          <td className="border border-slate-300 p-2 align-top whitespace-pre-wrap">{stage.studentActions || "—"}</td>
          <td className="border border-slate-300 p-2 align-top whitespace-pre-wrap">{stage.resources || "—"}</td>
        </tr>
      </tbody>
    </table></div>
    <dl className="grid gap-2 sm:hidden">
      {rows.map(([label, value]) => <div key={label} className="rounded-lg border border-[#d9d1c3] bg-surface p-3">
        <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
        <dd className="mt-1 whitespace-pre-wrap break-words text-sm">{value || "—"}</dd>
      </div>)}
    </dl>
    </>
  );
}
