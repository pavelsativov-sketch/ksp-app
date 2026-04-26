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
  return (
    <div className="print-plan bg-white border border-slate-200 rounded-lg p-6 md:p-8 space-y-6">
      <h1 className="text-2xl font-bold text-center">{plan.title}</h1>

      {totalTasks > 0 && (
        <div className="no-print flex justify-center">
          <Button
            type="button"
            size="lg"
            onClick={() => setQuizOpen(true)}
            className="bg-gradient-to-r from-amber-500 to-pink-600 hover:from-amber-600 hover:to-pink-700"
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

      <table className="w-full text-sm">
        <tbody>
          <TableRow label="Раздел долгосрочного плана" value={c.header.longTermPlanSection} />
          <TableRow label="Школа" value={c.header.school} />
          <TableRow label="Дата" value={c.header.date} />
          <TableRow label="ФИО учителя" value={c.header.teacherName} />
          <TableRow label="Класс" value={c.header.grade || String(plan.grade)} />
          <TableRow
            label="Присутствовало / Отсутствовало"
            value={`${c.header.studentsPresent ?? "—"} / ${c.header.studentsAbsent ?? "—"}`}
          />
          <TableRow label="Тема урока" value={c.topic} />
        </tbody>
      </table>

      <Section title="Цели обучения">
        {c.learningObjectives.length > 0 ? (
          <ul className="list-disc pl-6 space-y-1">
            {c.learningObjectives.map((o, i) => (
              <li key={i}>
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
      <h2 className="text-lg font-semibold border-b border-slate-200 pb-1">
        {title}
      </h2>
      <div className="text-sm space-y-1">{children}</div>
    </section>
  );
}

function TableRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-slate-200">
      <td className="py-1.5 pr-3 text-slate-500 w-1/3 align-top">{label}</td>
      <td className="py-1.5 align-top">{value || "—"}</td>
    </tr>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return <Empty />;
  return (
    <ul className="list-disc pl-6 space-y-1">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
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
      <h3 className="font-semibold mt-2">{title}</h3>
      <StageBody stage={stage} />
      {tasks.length > 0 && (
        <div className="mt-3 space-y-2 no-print">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Интерактивные задания этапа ({tasks.length})
          </p>
          {tasks.map((task) => (
            <div
              key={task.id}
              className="border border-slate-200 rounded-lg p-3 bg-slate-50/50"
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
  return (
    <table className="w-full text-sm border border-slate-300">
      <thead>
        <tr className="bg-slate-100">
          <th className="border border-slate-300 p-2 text-left w-[15%]">Время</th>
          <th className="border border-slate-300 p-2 text-left w-[40%]">Действия учителя</th>
          <th className="border border-slate-300 p-2 text-left w-[30%]">Действия учеников</th>
          <th className="border border-slate-300 p-2 text-left w-[15%]">Ресурсы</th>
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
    </table>
  );
}
