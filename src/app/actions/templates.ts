"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createTemplate, deleteTemplate, listTemplates, templateAsPlanContent } from "@/lib/templates";
import { createLessonPlanSchema } from "@/lib/validation/ksp";
import { MAX_PLAN_BYTES } from "@/lib/plan-versions";

export interface TemplateFormState {
  error?: string;
  info?: string;
  id?: string;
}

const empty: TemplateFormState = {};

/** Сохранить текущий план как шаблон: структура урока без темы и заданий. */
export async function saveTemplateFromPlan(input: {
  name: string;
  subject_id?: string | null;
  grade?: number | null;
  content: unknown;
}): Promise<TemplateFormState> {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Требуется вход" };
    // Шаблон приходит из браузера — валидируем полной схемой КСП.
    const parsed = createLessonPlanSchema
      .pick({ content: true })
      .safeParse({ content: input.content });
    if (!parsed.success) return { error: "Не удалось прочитать план. Откройте его и сохраните заново." };
    if (Buffer.byteLength(JSON.stringify(parsed.data), "utf8") > MAX_PLAN_BYTES) {
      return { error: "План слишком большой для шаблона" };
    }
    const result = await createTemplate(user.id, {
      name: input.name,
      subject_id: input.subject_id ?? null,
      grade: input.grade ?? null,
      content: parsed.data.content,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/templates");
    revalidatePath("/plans/new");
    return { info: "Шаблон сохранён", id: result.template.id };
  } catch {
    return { error: "Не удалось сохранить шаблон. Попробуйте позже." };
  }
}

export async function deleteTemplateAction(_: TemplateFormState, formData: FormData): Promise<TemplateFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Требуется вход" };
  const result = await deleteTemplate(user.id, String(formData.get("templateId") ?? ""));
  if (!result.ok) return { error: result.error };
  revalidatePath("/templates");
  return empty;
}

/**
 * Создать черновик КСП из шаблона.
 *
 * Тема обязательна: без неё урок бессмыслен, а шаблон её не хранит.
 * Возвращаем готовый конструктор, чтобы форма открылась уже заполненной.
 */
export async function planFromTemplateAction(
  _: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState & { draft?: { content: unknown; subject_id: string | null; grade: number | null } }> {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Требуется вход" };
    const topic = String(formData.get("topic") ?? "").trim().slice(0, 300);
    if (!topic) return { error: "Укажите тему урока" };
    const content = await templateAsPlanContent(user.id, String(formData.get("templateId") ?? ""), topic);
    if (!content) return { error: "Шаблон не найден" };
    const templates = await listTemplates(user.id);
    const template = templates.find((t) => t.id === String(formData.get("templateId") ?? ""));
    return {
      draft: { content, subject_id: template?.subject_id ?? null, grade: template?.grade ?? null },
      info: "Шаблон применён",
    };
  } catch {
    return { error: "Не удалось применить шаблон. Попробуйте позже." };
  }
}
