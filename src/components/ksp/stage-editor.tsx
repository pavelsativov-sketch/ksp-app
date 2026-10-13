"use client";

import type { LessonStage } from "@/lib/types/ksp";
import type { InteractiveTask } from "@/lib/ksp/tasks";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { AiEnhanceButton } from "./ai-enhance-button";
import { useUiLocale } from "@/components/i18n/use-ui-locale";
import { TaskBuilder } from "./task-builder";
import { ListEditor } from "./list-editor";
import { PlanBlockPicker, blockProvenance, type PlanReuseBlock } from "./plan-block-picker";

interface StageEditorProps {
  title: string;
  stageKey: "beginning" | "middle" | "end";
  stage: LessonStage;
  onChange: (stage: LessonStage) => void;
  context: { topic: string; grade: number; subject: string; language: "ru" | "kz" };
  availableObjectives: Array<{ code: string; text: string }>;
  availableCriteria?: string[];
}

export function StageEditor({ title, stageKey, stage, onChange, context, availableObjectives, availableCriteria = [] }: StageEditorProps) {
  const { t, locale } = useUiLocale();
  const st = t.planEditor.stages;
  const isKk = locale === "kk";
  const tasks = stage.tasks ?? [];
  function setTasks(next: InteractiveTask[]) {
    onChange({ ...stage, tasks: next });
  }
  function reuseStage(block: PlanReuseBlock) {
    if (block.kind !== "stage") return;
    const provenance = blockProvenance(block);
    const copied = JSON.parse(JSON.stringify(block.payload)) as LessonStage;
    const tasks = (copied.tasks ?? []).map((task) => ({
      ...task,
      id: globalThis.crypto?.randomUUID?.() ?? `copy_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      copiedFrom: task.copiedFrom ?? provenance,
    }));
    onChange({ ...copied, tasks, copiedFrom: provenance });
  }
  const timeHint =
    stageKey === "beginning" ? st.timeBeginning : stageKey === "middle" ? st.timeMiddle : st.timeEnd;
  /**
   * Значение метода оценивания хранится в плане как есть — это данные, а не
   * интерфейс. Переводится только подпись, чтобы планы, выгруженные в Word,
   * оставались одинаковыми в обоих языках.
   */
  const assessmentOptions: Array<{ value: string; label: string }> = [
    { value: "", label: st.methodNone },
    { value: "Похвала", label: st.methodPraise },
    { value: "ФО", label: st.methodFo },
    { value: "СОР", label: st.methodSor },
    { value: "Взаимооценивание", label: st.methodPeer },
    { value: "Самооценивание", label: st.methodSelf },
    { value: "ФО + Взаимооценивание", label: st.methodFoPeer },
  ];
  return (
    <section className="space-y-4 rounded-2xl border border-[#ddd5cb] bg-surface px-5 py-6 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ddd5cb] pb-4">
        <div>
          <p className="editorial-kicker">{st.kicker}</p>
          <h3 className="editorial-display mt-2 text-2xl">{title}</h3>
          {stage.copiedFrom && <p className="mt-2 text-xs text-[#756b63]">{isKk ? "Дереккөз жоспар" : "Источник: план"} «{stage.copiedFrom.sourcePlanTitle}» · {stage.copiedFrom.sourceGrade} {isKk ? "сынып" : "класс"}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PlanBlockPicker kind="stage" target={{ grade: context.grade, language: context.language }} onUse={reuseStage} />
          <Input
            className="w-36 font-mono text-xs"
            value={stage.time}
            onChange={(e) => onChange({ ...stage, time: e.target.value })}
            placeholder={timeHint}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="flex items-center justify-between">
            <Label>{st.teacherWords}</Label>
            <AiEnhanceButton
              section="teacherActions"
              stage={stageKey}
              current={stage.teacherActions}
              onApply={(improved) => onChange({ ...stage, teacherActions: improved })}
              context={context}
              label="AI"
            />
          </div>
          <Textarea
            rows={4}
            value={stage.teacherActions}
            onChange={(e) =>
              onChange({ ...stage, teacherActions: e.target.value })
            }
            placeholder={st.teacherWordsPh}
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label>{st.studentActions}</Label>
            <AiEnhanceButton
              section="studentActions"
              stage={stageKey}
              current={stage.studentActions}
              onApply={(improved) => onChange({ ...stage, studentActions: improved })}
              context={context}
              label="AI"
            />
          </div>
          <Textarea
            rows={4}
            value={stage.studentActions}
            onChange={(e) =>
              onChange({ ...stage, studentActions: e.target.value })
            }
          />
        </div>
        <div className="md:col-span-2">
          <div className="flex items-center justify-between">
            <Label>{st.resources}</Label>
            <AiEnhanceButton
              section="resources"
              stage={stageKey}
              current={stage.resources}
              onApply={(improved) => onChange({ ...stage, resources: improved })}
              context={context}
              label="AI"
            />
          </div>
          <Input
            value={stage.resources}
            onChange={(e) => onChange({ ...stage, resources: e.target.value })}
            placeholder={st.resourcesPh}
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label>
              {st.questions}{" "}
              <span className="text-xs text-slate-500">{st.questionsHint}</span>
            </Label>
            <AiEnhanceButton
              section="keyQuestions"
              stage={stageKey}
              current={stage.keyQuestions ?? []}
              onApply={(items) => onChange({ ...stage, keyQuestions: items })}
              context={context}
              label="AI"
            />
          </div>
          <ListEditor
            items={stage.keyQuestions ?? []}
            onChange={(items) => onChange({ ...stage, keyQuestions: items })}
            placeholder={
              stageKey === "beginning"
                ? st.qBeginPh
                : stageKey === "end"
                  ? st.qEndPh
                  : st.qMiddlePh
            }
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label>
              {st.descriptors}{" "}
              <span className="text-xs text-slate-500">
                {st.descriptorsHint}
              </span>
            </Label>
            <AiEnhanceButton
              section="descriptors"
              stage={stageKey}
              current={stage.descriptors ?? []}
              onApply={(items) => onChange({ ...stage, descriptors: items })}
              context={context}
              label="AI"
            />
          </div>
          <ListEditor
            items={stage.descriptors ?? []}
            onChange={(items) => onChange({ ...stage, descriptors: items })}
            placeholder={st.descriptorsPh}
          />
        </div>
        <div className="md:col-span-2">
          <Label>{st.assessmentMethod}</Label>
          <Select
            value={stage.assessmentMethod ?? ""}
            onValueChange={(v) =>
              onChange({ ...stage, assessmentMethod: v === "_none" ? "" : v })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={st.methodPh} />
            </SelectTrigger>
            <SelectContent>
              {assessmentOptions.map((option) => (
                <SelectItem key={option.value || "_none"} value={option.value || "_none"}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {stageKey === "end" && (
          <>
            <div className="md:col-span-2">
              <div className="flex items-center justify-between">
                <Label>{st.summary}</Label>
                <AiEnhanceButton
                  section="summary"
                  stage="end"
                  current={stage.summary ?? ""}
                  onApply={(improved) => onChange({ ...stage, summary: improved })}
                  context={context}
                  label="AI"
                />
              </div>
              <Textarea
                rows={2}
                value={stage.summary ?? ""}
                onChange={(e) => onChange({ ...stage, summary: e.target.value })}
                placeholder={st.summaryPh}
              />
            </div>
            <div className="md:col-span-2">
              <div className="flex items-center justify-between">
                <Label>
                  {st.reflectionQuestions}{" "}
                  <span className="text-xs text-slate-500">{st.reflectionHint}</span>
                </Label>
                <AiEnhanceButton
                  section="reflectionQuestions"
                  stage="end"
                  current={stage.reflectionQuestions ?? []}
                  onApply={(items) =>
                    onChange({ ...stage, reflectionQuestions: items })
                  }
                  context={context}
                  label="AI"
                />
              </div>
              <ListEditor
                items={stage.reflectionQuestions ?? []}
                onChange={(items) =>
                  onChange({ ...stage, reflectionQuestions: items })
                }
                placeholder={st.reflectionPh}
              />
            </div>
            <div className="md:col-span-2">
              <div className="flex items-center justify-between">
                <Label>{st.homework}</Label>
                <AiEnhanceButton
                  section="homework"
                  stage="end"
                  current={stage.homework ?? ""}
                  onApply={(improved) => onChange({ ...stage, homework: improved })}
                  context={context}
                  label="AI"
                />
              </div>
              <Textarea
                rows={2}
                value={stage.homework ?? ""}
                onChange={(e) =>
                  onChange({ ...stage, homework: e.target.value })
                }
                placeholder={st.homeworkPh}
              />
            </div>
          </>
        )}
      </div>
      <TaskBuilder
        tasks={tasks}
        onChange={setTasks}
        context={{ stage: stageKey, ...context }}
        availableObjectives={availableObjectives}
        availableCriteria={availableCriteria}
      />
    </section>
  );
}
