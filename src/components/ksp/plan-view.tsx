"use client";

import { useState } from "react";
import type { LessonPlanRow, LessonStage } from "@/lib/types/ksp";
import { TaskPlayer } from "./task-player";
import { QuizMode } from "./quiz-mode";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { taskTypeLabel } from "@/lib/ksp/tasks";
import {
  useEditableContent,
  useInlineEdit,
} from "./inline-edit-context";
import {
  EditableList,
  EditableRichText,
  EditableText,
} from "./editable";

export function PlanView({ plan }: { plan: LessonPlanRow }) {
  const c = useEditableContent(plan.content);
  const ctx = useInlineEdit();
  const update = ctx?.update;
  const editing = !!ctx?.enabled;

  const [quizOpen, setQuizOpen] = useState(false);
  const totalTasks =
    (c.stages.beginning.tasks?.length ?? 0) +
    (c.stages.middle.tasks?.length ?? 0) +
    (c.stages.end.tasks?.length ?? 0);

  return (
    <div className="print-plan bg-white border border-slate-200 rounded-lg p-3 sm:p-6 md:p-8 space-y-6">
      <h1 className="text-2xl font-bold text-center">{plan.title}</h1>

      {totalTasks > 0 && !editing && (
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

      <table className="w-full text-sm table-fixed">
        <tbody>
          <EditableTableRow
            label="Раздел долгосрочного плана"
            value={c.header.longTermPlanSection}
            onChange={
              update &&
              ((v) =>
                update((d) => {
                  d.header.longTermPlanSection = v;
                }))
            }
          />
          <EditableTableRow
            label="Школа"
            value={c.header.school}
            onChange={
              update &&
              ((v) =>
                update((d) => {
                  d.header.school = v;
                }))
            }
          />
          <EditableTableRow
            label="Дата"
            value={c.header.date}
            onChange={
              update &&
              ((v) =>
                update((d) => {
                  d.header.date = v;
                }))
            }
          />
          <EditableTableRow
            label="ФИО учителя"
            value={c.header.teacherName}
            onChange={
              update &&
              ((v) =>
                update((d) => {
                  d.header.teacherName = v;
                }))
            }
          />
          <EditableTableRow
            label="Класс"
            value={c.header.grade || String(plan.grade)}
            onChange={
              update &&
              ((v) =>
                update((d) => {
                  d.header.grade = v;
                }))
            }
          />
          <PresenceRow
            present={c.header.studentsPresent}
            absent={c.header.studentsAbsent}
            editing={editing}
            onPresent={
              update &&
              ((n) =>
                update((d) => {
                  d.header.studentsPresent = n;
                }))
            }
            onAbsent={
              update &&
              ((n) =>
                update((d) => {
                  d.header.studentsAbsent = n;
                }))
            }
          />
          <EditableTableRow
            label="Тема урока"
            value={c.topic}
            onChange={
              update &&
              ((v) =>
                update((d) => {
                  d.topic = v;
                }))
            }
          />
        </tbody>
      </table>

      <Section title="Цели обучения">
        <LearningObjectivesEditor
          items={c.learningObjectives}
          onChange={
            update &&
            ((next) =>
              update((d) => {
                d.learningObjectives = next;
              }))
          }
        />
      </Section>

      <Section title="Цели урока">
        <EditableList
          items={c.lessonObjectives}
          onChange={
            update &&
            ((next) =>
              update((d) => {
                d.lessonObjectives = next;
              }))
          }
          placeholder="Например: Учащийся объясняет…"
        />
      </Section>

      <Section title="Критерии оценивания">
        <EditableList
          items={c.assessmentCriteria}
          onChange={
            update &&
            ((next) =>
              update((d) => {
                d.assessmentCriteria = next;
              }))
          }
        />
      </Section>

      {c.pointsScale && c.pointsScale.length > 0 && (
        <Section title="Шкала оценивания за урок (10 баллов)">
          <PointsScaleTable items={c.pointsScale} />
          {editing && <FormHint />}
        </Section>
      )}

      <Section title="Языковые цели">
        <div className="space-y-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">
              Термины
            </p>
            <EditableList
              items={c.languageObjectives.terms}
              onChange={
                update &&
                ((next) =>
                  update((d) => {
                    d.languageObjectives.terms = next;
                  }))
              }
              placeholder="Термин"
              emptyContent={<p>—</p>}
            />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">
              Ключевые фразы
            </p>
            <EditableList
              items={c.languageObjectives.phrases}
              onChange={
                update &&
                ((next) =>
                  update((d) => {
                    d.languageObjectives.phrases = next;
                  }))
              }
              placeholder="Ключевая фраза"
              emptyContent={<p>—</p>}
            />
          </div>
        </div>
      </Section>

      <Section title="Привитие ценностей">
        <EditableText
          value={c.values}
          multiline
          onChange={
            update &&
            ((v) =>
              update((d) => {
                d.values = v;
              }))
          }
        />
      </Section>

      <Section title="Межпредметные связи">
        <EditableText
          value={c.crossCurricularLinks}
          multiline
          onChange={
            update &&
            ((v) =>
              update((d) => {
                d.crossCurricularLinks = v;
              }))
          }
        />
      </Section>

      <Section title="Предшествующие знания">
        <EditableText
          value={c.priorKnowledge}
          multiline
          onChange={
            update &&
            ((v) =>
              update((d) => {
                d.priorKnowledge = v;
              }))
          }
        />
      </Section>

      <Section title="Ход урока">
        <StageTable
          title="Начало урока"
          stage={c.stages.beginning}
          stageKey="beginning"
        />
        <StageTable
          title="Середина урока"
          stage={c.stages.middle}
          stageKey="middle"
        />
        <StageTable title="Конец урока" stage={c.stages.end} stageKey="end" />
      </Section>

      {c.overallRubric && c.overallRubric.length > 0 && (
        <Section title="Общий дескриптор за урок (1–10 баллов)">
          <OverallRubricTable items={c.overallRubric} />
          {editing && <FormHint />}
        </Section>
      )}

      <Section title="Оценивание и рефлексия">
        <EvalRow
          label="Формативное оценивание"
          value={c.evaluation.formativeAssessment}
          onChange={
            update &&
            ((v) =>
              update((d) => {
                d.evaluation.formativeAssessment = v;
              }))
          }
        />
        <EvalRow
          label="Дифференциация"
          value={c.evaluation.differentiation}
          onChange={
            update &&
            ((v) =>
              update((d) => {
                d.evaluation.differentiation = v;
              }))
          }
        />
        <EvalRow
          label="Здоровье и ТБ"
          value={c.evaluation.healthAndSafety}
          onChange={
            update &&
            ((v) =>
              update((d) => {
                d.evaluation.healthAndSafety = v;
              }))
          }
        />
        <EvalRow
          label="Рефлексия"
          value={c.evaluation.reflection}
          onChange={
            update &&
            ((v) =>
              update((d) => {
                d.evaluation.reflection = v;
              }))
          }
        />
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

function FormHint() {
  return (
    <p className="text-xs text-slate-500 italic mt-1">
      Для редактирования таблицы откройте полную форму («Редактировать»).
    </p>
  );
}

function EditableTableRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
}) {
  return (
    <tr className="border-b border-slate-200">
      <td className="py-1.5 pr-3 text-slate-500 w-2/5 sm:w-1/3 align-top text-xs sm:text-sm">
        {label}
      </td>
      <td className="py-1.5 align-top break-words">
        <EditableText value={value} onChange={onChange} />
      </td>
    </tr>
  );
}

function PresenceRow({
  present,
  absent,
  editing,
  onPresent,
  onAbsent,
}: {
  present: number | null;
  absent: number | null;
  editing: boolean;
  onPresent?: (n: number | null) => void;
  onAbsent?: (n: number | null) => void;
}) {
  return (
    <tr className="border-b border-slate-200">
      <td className="py-1.5 pr-3 text-slate-500 w-2/5 sm:w-1/3 align-top text-xs sm:text-sm">
        Присутствовало / Отсутствовало
      </td>
      <td className="py-1.5 align-top break-words">
        {editing && onPresent && onAbsent ? (
          <div className="flex items-center gap-2">
            <NumberInput value={present} onChange={onPresent} />
            <span className="text-slate-500">/</span>
            <NumberInput value={absent} onChange={onAbsent} />
          </div>
        ) : (
          <>{`${present ?? "—"} / ${absent ?? "—"}`}</>
        )}
      </td>
    </tr>
  );
}

function NumberInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
}) {
  return (
    <input
      type="number"
      min={0}
      className="w-20 border border-amber-300 rounded px-2 py-1 text-sm bg-amber-50/30"
      value={value ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "") onChange(null);
        else {
          const n = Number(v);
          if (!Number.isNaN(n)) onChange(n);
        }
      }}
    />
  );
}

function EvalRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <EditableText value={value} multiline onChange={onChange} />
    </div>
  );
}

function LearningObjectivesEditor({
  items,
  onChange,
}: {
  items: Array<{ code: string; text: string }>;
  onChange?: (next: Array<{ code: string; text: string }>) => void;
}) {
  const ctx = useInlineEdit();
  const editing = !!ctx?.enabled && !!onChange;

  if (!editing) {
    if (items.length === 0) return <Empty />;
    return (
      <ul className="list-disc pl-6 space-y-1">
        {items.map((o, i) => (
          <li key={i}>
            {o.code && (
              <span className="font-mono text-slate-600">{o.code} — </span>
            )}
            {o.text}
          </li>
        ))}
      </ul>
    );
  }

  const update = (i: number, patch: Partial<{ code: string; text: string }>) => {
    const next = items.slice();
    next[i] = { ...next[i], ...patch };
    onChange!(next);
  };
  const remove = (i: number) => {
    const next = items.slice();
    next.splice(i, 1);
    onChange!(next);
  };
  const add = () => onChange!([...items, { code: "", text: "" }]);

  return (
    <div className="space-y-1.5">
      {items.length === 0 && (
        <p className="text-xs text-slate-500 italic">
          Нет целей — добавьте через «＋».
        </p>
      )}
      {items.map((o, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <input
            type="text"
            className="w-32 shrink-0 border border-amber-300 rounded px-2 py-1 text-sm bg-amber-50/30 font-mono"
            value={o.code}
            onChange={(e) => update(i, { code: e.target.value })}
            placeholder="5.2.1.3"
          />
          <input
            type="text"
            className="flex-1 border border-amber-300 rounded px-2 py-1 text-sm bg-amber-50/30"
            value={o.text}
            onChange={(e) => update(i, { text: e.target.value })}
            placeholder="Текст цели"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-slate-400 hover:text-red-600 mt-1.5 p-0.5"
            aria-label="Удалить цель"
            title="Удалить цель"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-xs text-amber-700 hover:text-amber-900 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-amber-100/60"
      >
        + Добавить
      </button>
    </div>
  );
}

function PointsScaleTable({
  items,
}: {
  items: NonNullable<LessonPlanRow["content"]["pointsScale"]>;
}) {
  const total = items.reduce((s, it) => s + (it.points || 0), 0);
  return (
    <table className="w-full text-sm border border-slate-300">
      <thead>
        <tr className="bg-slate-50">
          <th
            scope="col"
            className="text-left font-semibold border-b border-slate-300 px-3 py-1.5"
          >
            За что начисляется балл
          </th>
          <th
            scope="col"
            className="text-right font-semibold border-b border-l border-slate-300 px-3 py-1.5 w-24"
          >
            Баллы
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((it, i) => (
          <tr key={i} className="border-b border-slate-200 last:border-b-0">
            <td className="px-3 py-1.5 align-top">{it.label || "—"}</td>
            <td className="px-3 py-1.5 text-right border-l border-slate-200 font-mono">
              {it.points}
            </td>
          </tr>
        ))}
        <tr className="bg-slate-50 font-semibold">
          <td className="px-3 py-1.5 text-right">Итого:</td>
          <td className="px-3 py-1.5 text-right border-l border-slate-300 font-mono">
            {total}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function OverallRubricTable({
  items,
}: {
  items: NonNullable<LessonPlanRow["content"]["overallRubric"]>;
}) {
  // Sort by points ascending so the rubric reads from "low" to "high".
  const sorted = [...items].sort((a, b) => a.points - b.points);
  return (
    <table className="w-full text-sm border border-slate-300">
      <thead>
        <tr className="bg-slate-50">
          <th
            scope="col"
            className="text-right font-semibold border-b border-slate-300 px-3 py-1.5 w-20"
          >
            Балл
          </th>
          <th
            scope="col"
            className="text-left font-semibold border-b border-l border-slate-300 px-3 py-1.5"
          >
            Что демонстрирует ученик
          </th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((it, i) => (
          <tr key={i} className="border-b border-slate-200 last:border-b-0">
            <td className="px-3 py-1.5 text-right font-mono align-top">
              {it.points}
            </td>
            <td className="px-3 py-1.5 align-top border-l border-slate-200">
              {it.descriptor || "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Empty() {
  return <p className="text-slate-400 italic">—</p>;
}

const TONE: Record<string, string> = {
  sky: "bg-sky-50 border-sky-200 text-sky-900",
  emerald: "bg-emerald-50 border-emerald-200 text-emerald-900",
  amber: "bg-amber-50 border-amber-200 text-amber-900",
  slate: "bg-slate-50 border-slate-200 text-slate-900",
  violet: "bg-violet-50 border-violet-200 text-violet-900",
  rose: "bg-rose-50 border-rose-200 text-rose-900",
};

function MiniBlock({
  title,
  tone,
  children,
}: {
  title: string;
  tone: keyof typeof TONE;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-md border px-3 py-2 ${TONE[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider opacity-70 mb-1">
        {title}
      </p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

type StageKey = "beginning" | "middle" | "end";

function StageTable({
  title,
  stage,
  stageKey,
}: {
  title: string;
  stage: LessonStage;
  stageKey: StageKey;
}) {
  const ctx = useInlineEdit();
  const update = ctx?.update;
  const editing = !!ctx?.enabled;

  const tasks = stage.tasks ?? [];
  const keyQuestionsRaw = stage.keyQuestions ?? [];
  const descriptorsRaw = stage.descriptors ?? [];
  const reflectionRaw = stage.reflectionQuestions ?? [];
  const keyQuestions = keyQuestionsRaw.filter((q) => q.trim());
  const descriptors = descriptorsRaw.filter((d) => d.trim());
  const reflectionQuestions = reflectionRaw.filter((q) => q.trim());

  const showKey = editing || keyQuestions.length > 0;
  const showDesc = editing || descriptors.length > 0;
  const showAssess = editing || !!stage.assessmentMethod;
  const showSummary = editing || !!stage.summary;
  const showRefl = editing || reflectionQuestions.length > 0;
  const showHw = editing || !!stage.homework;
  const anyMini =
    showKey || showDesc || showAssess || showSummary || showRefl || showHw;

  return (
    <div className="space-y-2">
      <h3 className="font-semibold mt-2">{title}</h3>
      <StageBody stage={stage} stageKey={stageKey} />

      {anyMini && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2 text-sm">
          {showKey && (
            <MiniBlock title="Ключевые вопросы" tone="sky">
              <EditableList
                items={keyQuestionsRaw}
                onChange={
                  update &&
                  ((next) =>
                    update((d) => {
                      d.stages[stageKey].keyQuestions = next;
                    }))
                }
                placeholder="Открытый вопрос…"
              />
            </MiniBlock>
          )}
          {showDesc && (
            <MiniBlock title="Дескрипторы оценивания (этап)" tone="emerald">
              <EditableList
                items={descriptorsRaw}
                onChange={
                  update &&
                  ((next) =>
                    update((d) => {
                      d.stages[stageKey].descriptors = next;
                    }))
                }
                placeholder="Записывает команду…"
              />
            </MiniBlock>
          )}
          {showAssess && (
            <MiniBlock title="Метод оценивания" tone="amber">
              <EditableText
                value={stage.assessmentMethod ?? ""}
                onChange={
                  update &&
                  ((v) =>
                    update((d) => {
                      d.stages[stageKey].assessmentMethod = v;
                    }))
                }
              />
            </MiniBlock>
          )}
          {showSummary && (
            <MiniBlock title="Итог урока" tone="slate">
              <EditableText
                value={stage.summary ?? ""}
                multiline
                onChange={
                  update &&
                  ((v) =>
                    update((d) => {
                      d.stages[stageKey].summary = v;
                    }))
                }
              />
            </MiniBlock>
          )}
          {showRefl && (
            <MiniBlock title="Рефлексия" tone="violet">
              <EditableList
                items={reflectionRaw}
                onChange={
                  update &&
                  ((next) =>
                    update((d) => {
                      d.stages[stageKey].reflectionQuestions = next;
                    }))
                }
                placeholder="Что нового я узнал?"
              />
            </MiniBlock>
          )}
          {showHw && (
            <MiniBlock title="Домашнее задание" tone="rose">
              <EditableText
                value={stage.homework ?? ""}
                multiline
                onChange={
                  update &&
                  ((v) =>
                    update((d) => {
                      d.stages[stageKey].homework = v;
                    }))
                }
              />
            </MiniBlock>
          )}
        </div>
      )}

      {tasks.length > 0 && !editing && (
        <div className="mt-3 space-y-2 no-print">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Интерактивные задания этапа ({tasks.length})
          </p>
          {tasks.map((task, idx) => (
            <div
              key={task.id}
              className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 hover:border-slate-300 transition-colors"
            >
              <TaskPlayer task={task} />
              {(task.descriptors?.length ?? 0) > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-200">
                  <p className="text-xs font-medium text-slate-600">
                    Дескрипторы задания {idx + 1}:
                  </p>
                  <ul className="list-disc pl-5 text-xs text-slate-600">
                    {task.descriptors!.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {tasks.length > 0 && editing && (
        <p className="text-xs text-slate-500 italic mt-2">
          Интерактивные задания этапа ({tasks.length}) — редактируются в полной
          форме («Редактировать»).
        </p>
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

function StageBody({
  stage,
  stageKey,
}: {
  stage: LessonStage;
  stageKey: StageKey;
}) {
  const ctx = useInlineEdit();
  const update = ctx?.update;

  return (
    <>
      {/* Mobile / narrow viewport: stacked card layout. */}
      <div className="sm:hidden print:hidden border border-slate-300 rounded">
        <MobileStageRow
          label="Время"
          value={stage.time}
          onChange={
            update &&
            ((v) =>
              update((d) => {
                d.stages[stageKey].time = v;
              }))
          }
        />
        <MobileStageRich
          label="Действия учителя"
          rich={stage.teacherActions}
          onChange={
            update &&
            ((v) =>
              update((d) => {
                d.stages[stageKey].teacherActions = v;
              }))
          }
        />
        <MobileStageRich
          label="Действия учеников"
          rich={stage.studentActions}
          onChange={
            update &&
            ((v) =>
              update((d) => {
                d.stages[stageKey].studentActions = v;
              }))
          }
        />
        <MobileStageRow
          label="Ресурсы"
          value={stage.resources}
          onChange={
            update &&
            ((v) =>
              update((d) => {
                d.stages[stageKey].resources = v;
              }))
          }
          last
        />
      </div>
      {/* sm+ and print: real 4-column table. */}
      <div className="hidden sm:block print:block overflow-x-auto">
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
              <td className="border border-slate-300 p-2 align-top whitespace-pre-wrap">
                <EditableText
                  value={stage.time}
                  multiline
                  onChange={
                    update &&
                    ((v) =>
                      update((d) => {
                        d.stages[stageKey].time = v;
                      }))
                  }
                  rows={2}
                />
              </td>
              <td className="border border-slate-300 p-2 align-top">
                <EditableRichText
                  value={stage.teacherActions}
                  onChange={
                    update &&
                    ((v) =>
                      update((d) => {
                        d.stages[stageKey].teacherActions = v;
                      }))
                  }
                  placeholder="Действия учителя…"
                  rows={6}
                />
              </td>
              <td className="border border-slate-300 p-2 align-top">
                <EditableRichText
                  value={stage.studentActions}
                  onChange={
                    update &&
                    ((v) =>
                      update((d) => {
                        d.stages[stageKey].studentActions = v;
                      }))
                  }
                  placeholder="Действия учеников…"
                  rows={6}
                />
              </td>
              <td className="border border-slate-300 p-2 align-top whitespace-pre-wrap">
                <EditableText
                  value={stage.resources}
                  multiline
                  onChange={
                    update &&
                    ((v) =>
                      update((d) => {
                        d.stages[stageKey].resources = v;
                      }))
                  }
                  rows={2}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function MobileStageRow({
  label,
  value,
  onChange,
  last,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  last?: boolean;
}) {
  return (
    <div className={`p-2 ${last ? "" : "border-b border-slate-200"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
        {label}
      </p>
      <div className="whitespace-pre-wrap">
        <EditableText value={value} multiline onChange={onChange} />
      </div>
    </div>
  );
}

function MobileStageRich({
  label,
  rich,
  onChange,
}: {
  label: string;
  rich: string;
  onChange?: (v: string) => void;
}) {
  return (
    <div className="p-2 border-b border-slate-200">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
        {label}
      </p>
      <EditableRichText value={rich} onChange={onChange} rows={4} />
    </div>
  );
}
