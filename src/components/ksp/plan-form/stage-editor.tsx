"use client";

import type { LessonStage } from "@/lib/types/ksp";
import type { InteractiveTask } from "@/lib/ksp/tasks";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { TaskBuilder } from "../task-builder";
import { ListEditor } from "../list-editor";
import { RichTextEditor } from "../rich-text-editor";
import { uploadPlanImage } from "@/lib/upload-image";

const TIME_HINTS: Record<"beginning" | "middle" | "end", string> = {
  beginning: "1–10 мин",
  middle: "11–35 мин",
  end: "36–45 мин",
};

const KEY_QUESTIONS_HINT: Record<"beginning" | "middle" | "end", string> = {
  beginning: "Напр. «Что вы помните из предыдущего урока?»",
  middle: "Напр. «Какое свойство вы заметили?»",
  end: "Напр. «Что нового вы узнали?»",
};

export function StageEditor({
  title,
  stageKey,
  stage,
  onChange,
  context,
  availableObjectives,
}: {
  title: string;
  stageKey: "beginning" | "middle" | "end";
  stage: LessonStage;
  onChange: (stage: LessonStage) => void;
  context: {
    topic: string;
    grade: number;
    subject: string;
    language: "ru" | "kz";
  };
  availableObjectives: Array<{ code: string; text: string }>;
}) {
  const tasks = stage.tasks ?? [];
  function setTasks(next: InteractiveTask[]) {
    onChange({ ...stage, tasks: next });
  }
  return (
    <div className="border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <Input
          className="w-40"
          value={stage.time}
          onChange={(e) => onChange({ ...stage, time: e.target.value })}
          placeholder={TIME_HINTS[stageKey]}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Действия учителя</Label>
          <RichTextEditor
            rows={4}
            value={stage.teacherActions}
            onChange={(html) => onChange({ ...stage, teacherActions: html })}
            onUploadImage={uploadPlanImage}
            placeholder="Что делает учитель: объясняет, демонстрирует, направляет…"
          />
        </div>
        <div>
          <Label>Действия учеников</Label>
          <RichTextEditor
            rows={4}
            value={stage.studentActions}
            onChange={(html) => onChange({ ...stage, studentActions: html })}
            onUploadImage={uploadPlanImage}
            placeholder="Что делают ученики: записывают, сравнивают, обсуждают…"
          />
        </div>
        <div className="md:col-span-2">
          <Label>Ресурсы</Label>
          <Input
            value={stage.resources}
            onChange={(e) => onChange({ ...stage, resources: e.target.value })}
            placeholder="Учебник, презентация, раздаточный материал"
          />
        </div>
        <div>
          <Label>
            Ключевые вопросы (кумулятивная беседа){" "}
            <span className="text-xs text-slate-500">— для активизации</span>
          </Label>
          <ListEditor
            items={stage.keyQuestions ?? []}
            onChange={(items) => onChange({ ...stage, keyQuestions: items })}
            placeholder={KEY_QUESTIONS_HINT[stageKey]}
          />
        </div>
        <div>
          <Label>
            Дескрипторы оценивания{" "}
            <span className="text-xs text-slate-500">
              — что именно делает ученик
            </span>
          </Label>
          <ListEditor
            items={stage.descriptors ?? []}
            onChange={(items) => onChange({ ...stage, descriptors: items })}
            placeholder="Напр. «Записывает определение»"
          />
        </div>
        <div className="md:col-span-2">
          <Label>Метод оценивания</Label>
          <Select
            value={stage.assessmentMethod ?? ""}
            onValueChange={(v) =>
              onChange({ ...stage, assessmentMethod: v === "_none" ? "" : v })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Выберите метод" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— не указан —</SelectItem>
              <SelectItem value="Похвала">Похвала</SelectItem>
              <SelectItem value="ФО">ФО (формативное)</SelectItem>
              <SelectItem value="СОР">СОР (суммативное за раздел)</SelectItem>
              <SelectItem value="Взаимооценивание">Взаимооценивание</SelectItem>
              <SelectItem value="Самооценивание">Самооценивание</SelectItem>
              <SelectItem value="ФО + Взаимооценивание">
                ФО + Взаимооценивание
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {stageKey === "end" && (
          <>
            <div className="md:col-span-2">
              <Label>Итог урока</Label>
              <Textarea
                rows={2}
                value={stage.summary ?? ""}
                onChange={(e) => onChange({ ...stage, summary: e.target.value })}
                placeholder="1–2 предложения: что узнали, что закрепили"
              />
            </div>
            <div className="md:col-span-2">
              <Label>
                Рефлексивные вопросы ученикам{" "}
                <span className="text-xs text-slate-500">— 3 открытых</span>
              </Label>
              <ListEditor
                items={stage.reflectionQuestions ?? []}
                onChange={(items) =>
                  onChange({ ...stage, reflectionQuestions: items })
                }
                placeholder="Напр. «Что было сложно?»"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Домашнее задание</Label>
              <Textarea
                rows={2}
                value={stage.homework ?? ""}
                onChange={(e) =>
                  onChange({ ...stage, homework: e.target.value })
                }
                placeholder="Конкретное задание с комментарием"
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
      />
    </div>
  );
}
