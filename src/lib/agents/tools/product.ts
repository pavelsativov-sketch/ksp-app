import { z } from 'zod';
import type { ToolCtx } from './index';
import { kspToMarkdown, ktpToMarkdown, planLinks, slugForFile } from '@/lib/agents/deliverables';

type Ctx = Partial<ToolCtx>;

const createKspSchema = z.object({
  grade: z.coerce.number().int().min(1).max(11),
  subject: z.string().trim().min(1).max(200),
  topic: z.string().trim().min(1).max(2_000),
  language: z.enum(['ru', 'kz']).default('ru'),
  objectives: z.array(z.string().trim().min(1).max(1_000)).max(30).optional(),
});

const createKtpSchema = z.object({
  planId: z.string().regex(/^[0-9a-f]{24}$/i, 'Некорректный идентификатор плана'),
  topics: z.array(z.string().trim().min(1).max(300)).min(1).max(40).optional(),
  startDate: z.string().optional(),
});

/** Копия материала в рабочей области: видна в «Файлах», её можно править в редакторе. */
async function saveCopyToWorkspace(userId: string, filename: string, content: string): Promise<string | undefined> {
  try {
    const { getWorkspaceRuntime } = await import('@/lib/workspace/runtime');
    await (await getWorkspaceRuntime(userId)).writeFile(filename, content.slice(0, 190_000));
    return filename;
  } catch {
    // Рабочая область может быть недоступна — сам материал при этом создан.
    return undefined;
  }
}

/**
 * Инструменты продукта: агент создаёт настоящие КСП и КТП теми же генераторами,
 * что и формы сайта (с квотой тарифа и сохранением в аккаунт учителя), а не
 * «пишет текст про урок». Результат — готовые ссылки на страницу, Word и PowerPoint.
 */
export const productTools = {
  createKsp: async (args: Record<string, unknown>, ctx?: Ctx) => {
    if (!ctx?.userId) return { success: false, error: 'Нет пользователя сессии' };
    const parsed = createKspSchema.safeParse({
      grade: args.grade,
      subject: args.subject,
      topic: args.topic,
      language: args.language ?? 'ru',
      objectives: args.objectives,
    });
    if (!parsed.success) {
      return { success: false, error: `Некорректные параметры КСП: ${parsed.error.issues.map((i) => i.message).join(', ')}` };
    }
    const input = parsed.data;
    if (ctx.signal?.aborted) return { success: false, error: 'Задача остановлена пользователем' };

    const { reserveQuota } = await import('@/lib/billing/quota');
    const quota = await reserveQuota({ id: ctx.userId }, 'generation');
    if (!quota.ok) return { success: false, error: quota.message };

    try {
      const { generateKspWithModel } = await import('@/lib/ai/generate');
      const { mergeAiIntoKsp } = await import('@/lib/ai/merge');
      const { emptyKsp } = await import('@/lib/types/ksp');
      const { getSubjectByName } = await import('@/lib/plans-repo');
      const { createLessonPlanSchema } = await import('@/lib/validation/ksp');
      const { planState, isBoundedPlan } = await import('@/lib/plan-versions');
      const { getDb, COL } = await import('@/lib/mongo');

      const { payload } = await generateKspWithModel({
        grade: input.grade,
        subject: input.subject,
        topic: input.topic,
        language: input.language,
        learningObjectives: input.objectives,
        signal: ctx.signal,
      });
      const base = emptyKsp();
      base.topic = input.topic;
      const content = mergeAiIntoKsp(base, payload);
      const subject = await getSubjectByName(input.subject).catch(() => null);
      const title = `${input.subject}: ${input.topic}`.slice(0, 200);

      const plan = createLessonPlanSchema.safeParse({
        title,
        subject_id: subject?.id ?? null,
        grade: input.grade,
        quarter: null,
        section: null,
        visibility: 'private',
        language: input.language,
        content,
      });
      if (!plan.success) {
        await quota.reservation.finalize(false);
        return { success: false, error: `План получился некорректным: ${plan.error.issues.map((i) => i.message).slice(0, 3).join(', ')}` };
      }
      if (!isBoundedPlan(plan.data)) {
        await quota.reservation.finalize(false);
        return { success: false, error: 'План получился слишком большим' };
      }

      const state = planState({ ...plan.data, is_draft: false });
      const now = new Date();
      const db = await getDb();
      const inserted = await db.collection(COL.plans).insertOne({ ...state, owner_id: ctx.userId, created_at: now, updated_at: now });
      const planId = inserted.insertedId.toString();
      await quota.reservation.finalize(true);

      const file = await saveCopyToWorkspace(
        ctx.userId,
        `ksp-${slugForFile(input.topic)}.md`,
        kspToMarkdown({ title, grade: input.grade, language: input.language, content }),
      );
      return {
        success: true,
        planId,
        title,
        ...planLinks(planId),
        ...(file ? { file } : {}),
        objectives: (content.lessonObjectives ?? []).slice(0, 5),
        message: `КСП «${title}» создан и сохранён в вашем аккаунте. Страница: /plans/${planId}. Word и PowerPoint скачиваются со страницы плана.`,
      };
    } catch (error) {
      await quota.reservation.finalize(false).catch(() => {});
      return {
        success: false,
        error: error instanceof Error && error.message ? `Не удалось создать КСП: ${error.message.slice(0, 200)}` : 'Не удалось создать КСП. Провайдер ИИ недоступен — попробуйте позже.',
      };
    }
  },

  listPlans: async (args: Record<string, unknown>, ctx?: Ctx) => {
    if (!ctx?.userId) return { success: false, error: 'Нет пользователя сессии' };
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);
    try {
      const { getDb, COL } = await import('@/lib/mongo');
      const docs = await (await getDb())
        .collection(COL.plans)
        .find({ owner_id: ctx.userId, is_draft: { $ne: true } }, { projection: { title: 1, grade: 1, language: 1, updated_at: 1, 'content.topic': 1 } })
        .sort({ updated_at: -1 })
        .limit(limit)
        .toArray();
      return {
        success: true,
        plans: docs.map((d) => ({
          planId: String(d._id),
          title: String(d.title ?? ''),
          grade: d.grade,
          topic: String((d.content as { topic?: string } | undefined)?.topic ?? ''),
        })),
      };
    } catch {
      return { success: false, error: 'Не удалось получить список планов' };
    }
  },

  createKtp: async (args: Record<string, unknown>, ctx?: Ctx) => {
    if (!ctx?.userId) return { success: false, error: 'Нет пользователя сессии' };
    const parsed = createKtpSchema.safeParse({ planId: args.planId, topics: args.topics, startDate: args.startDate });
    if (!parsed.success) {
      return { success: false, error: `Некорректные параметры КТП: ${parsed.error.issues.map((i) => i.message).join(', ')}. Сначала вызови listPlans или createKsp, чтобы получить planId.` };
    }
    try {
      const { getPlanForUser } = await import('@/lib/billing/quota');
      const usage = await getPlanForUser(ctx.userId);
      if (usage.limits.ktp !== true) {
        return { success: false, error: 'Календарно-тематический план доступен на тарифе Pro. Сообщи об этом пользователю.' };
      }
      const { ktpRequestSchema, buildKtp } = await import('@/lib/ktp');
      const request = ktpRequestSchema.safeParse(parsed.data);
      if (!request.success) return { success: false, error: 'Некорректные темы или дата КТП (дата в формате ГГГГ-ММ-ДД)' };

      const { getPlanById, getSubjectById } = await import('@/lib/plans-repo');
      const plan = await getPlanById(request.data.planId);
      if (!plan || plan.owner_id !== ctx.userId) return { success: false, error: 'План не найден среди ваших планов' };
      const subject = plan.subject_id ? await getSubjectById(plan.subject_id) : null;
      const subjectName = subject ? (plan.language === 'kz' ? subject.name_kz || subject.name_ru : subject.name_ru) : '';
      // КСП, созданный агентом, хранит цели в lessonObjectives, а КТП берёт цели
      // из learningObjectives: без переноса колонка «Цели» оставалась пустой.
      const objectives = plan.content.learningObjectives.length
        ? plan.content.learningObjectives
        : (plan.content.lessonObjectives ?? []).map((text, index) => ({ code: `Цель ${index + 1}`, text }));
      const ktp = buildKtp({ ...plan, content: { ...plan.content, learningObjectives: objectives } }, subjectName, request.data);

      const file = await saveCopyToWorkspace(ctx.userId, `ktp-${slugForFile(plan.content.topic || plan.title)}.md`, ktpToMarkdown(ktp));
      return {
        success: true,
        title: `КТП: ${plan.title}`,
        url: `/plans/${plan.id}`,
        ...(file ? { file } : {}),
        rows: ktp.rows.slice(0, 40).map((r) => ({ number: r.number, topic: r.topic, hours: r.hours, date: r.date })),
        message: `КТП на ${ktp.rows.length} тем(ы) составлен. Word-файл скачивается кнопкой «КТП» на странице плана /plans/${plan.id}.`,
      };
    } catch {
      return { success: false, error: 'Не удалось составить КТП. Попробуйте ещё раз.' };
    }
  },
};
