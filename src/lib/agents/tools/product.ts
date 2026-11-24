import { z } from 'zod';
import type { ToolCtx } from './index';
import { kspToMarkdown, ktpToMarkdown, planLinks, slugForFile } from '@/lib/agents/deliverables';
import { applyKitToContent, kitAnswersSchema, toLessonKit } from '@/lib/materials/kit';

type Ctx = Partial<ToolCtx>;

const createKspSchema = z.object({
  grade: z.coerce.number().int().min(1).max(11),
  subject: z.string().trim().min(1).max(200),
  topic: z.string().trim().min(1).max(2_000),
  language: z.enum(['ru', 'kz']).default('ru'),
  objectives: z.array(z.string().trim().min(1).max(1_000)).max(30).optional(),
  kit: kitAnswersSchema.optional(),
});

const createKtpSchema = z.object({
  planId: z.string().regex(/^[0-9a-f]{24}$/i, 'Некорректный идентификатор плана'),
  topics: z.array(z.string().trim().min(1).max(300)).min(1).max(40).optional(),
  startDate: z.string().optional(),
});

const createSorSochSchema = z.object({
  subject: z.string().trim().min(2).max(120),
  grade: z.coerce.number().int().min(1).max(11),
  quarter: z.coerce.number().int().min(1).max(4).default(1),
  workType: z.string().trim().min(2).max(40).default('СОР №1'),
  language: z.enum(['ru', 'kz']).default('ru'),
  maxPoints: z.coerce.number().int().min(5).max(50).default(15),
  durationMinutes: z.coerce.number().int().min(15).max(90).default(25),
  sectionOrTopic: z.string().trim().max(300).optional().default(''),
  learningObjectives: z.array(z.string().trim().min(2).max(500)).max(10).optional().default([]),
  taskCount: z.coerce.number().int().min(3).max(8).optional().default(4),
});

const createPresentationSchema = z.object({
  planId: z.string().regex(/^[0-9a-f]{24}$/i).optional(),
  theme: z.enum(['network', 'lavender', 'ocean', 'sunset']).default('network'),
});

const assignHomeworkSchema = z.object({
  planId: z.string().regex(/^[0-9a-f]{24}$/i).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  daysValid: z.coerce.number().int().min(1).max(60).default(14),
});

const createSchoolDocSchema = z.object({
  docType: z.enum(['vsk-spravka', 'characteristic', 'homeroom', 'iom']),
  title: z.string().trim().min(2).max(200),
  details: z.string().trim().min(3).max(3_000),
  language: z.enum(['ru', 'kz']).default('ru'),
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

async function resolveTargetPlanId(userId: string, planId?: string): Promise<string | null> {
  if (planId && /^[0-9a-f]{24}$/i.test(planId)) return planId;
  const { getDb, COL } = await import('@/lib/mongo');
  const latest = await (await getDb())
    .collection(COL.plans)
    .findOne(
      { owner_id: userId, is_draft: { $ne: true } },
      { sort: { updated_at: -1 }, projection: { _id: 1 } },
    );
  return latest?._id ? String(latest._id) : null;
}

/**
 * Инструменты продукта: агент создаёт настоящие КСП, КТП, СОР/СОЧ, презентации,
 * онлайн-ДЗ по коду и школьные документы теми же генераторами, что и формы сайта.
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
      kit: args.kit,
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

      const { matchObjectives } = await import('@/lib/goso/match');
      const autoObjectives = input.objectives?.length ? [] : matchObjectives({ subject: input.subject, grade: input.grade, topic: input.topic });
      const kit = input.kit ? toLessonKit(input.kit, input.language) : undefined;
      const { payload } = await generateKspWithModel({
        kit,
        grade: input.grade,
        subject: input.subject,
        topic: input.topic,
        language: input.language,
        learningObjectives: autoObjectives.length ? autoObjectives.map((o) => `${o.code} — ${o.text}`) : input.objectives,
        signal: ctx.signal,
      });
      const base = emptyKsp();
      base.topic = input.topic;
      base.learningObjectives = autoObjectives;
      if (typeof args.teacherName === 'string') base.header.teacherName = args.teacherName;
      const merged = mergeAiIntoKsp(base, payload);
      const content = kit ? applyKitToContent(merged, kit) : merged;
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

      const file = args.saveCopy === false ? undefined : await saveCopyToWorkspace(
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
      const objectives = plan.content.learningObjectives.length
        ? plan.content.learningObjectives
        : (plan.content.lessonObjectives ?? []).map((text, index) => ({ code: `Цель ${index + 1}`, text }));
      const { objectivesForTopic } = await import('@/lib/goso/match');
      const ktp = buildKtp({ ...plan, content: { ...plan.content, learningObjectives: objectives } }, subjectName, request.data, (topic) => objectivesForTopic(subject?.name_ru ?? '', plan.grade, topic));

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

  createSorSoch: async (args: Record<string, unknown>, ctx?: Ctx) => {
    if (!ctx?.userId) return { success: false, error: 'Нет пользователя сессии' };
    const parsed = createSorSochSchema.safeParse({
      subject: args.subject,
      grade: args.grade,
      quarter: args.quarter ?? 1,
      workType: args.workType ?? 'СОР №1',
      language: args.language ?? 'ru',
      maxPoints: args.maxPoints ?? 15,
      durationMinutes: args.durationMinutes ?? 25,
      sectionOrTopic: args.sectionOrTopic ?? '',
      learningObjectives: args.learningObjectives ?? [],
      taskCount: args.taskCount ?? 4,
    });
    if (!parsed.success) {
      return { success: false, error: `Некорректные параметры СОР/СОЧ: ${parsed.error.issues.map((i) => i.message).join(', ')}` };
    }
    if (ctx.signal?.aborted) return { success: false, error: 'Задача остановлена пользователем' };

    const { reserveQuota } = await import('@/lib/billing/quota');
    const quota = await reserveQuota({ id: ctx.userId }, 'assist');
    if (!quota.ok) return { success: false, error: quota.message };

    try {
      const { generateSorSochWork } = await import('@/lib/ai/sor-soch-generator');
      const { getDb, COL } = await import('@/lib/mongo');
      const { matchObjectives } = await import('@/lib/goso/match');

      const input = parsed.data;
      const objectives =
        input.learningObjectives.length > 0
          ? input.learningObjectives
          : matchObjectives({
              subject: input.subject,
              grade: input.grade,
              topic: input.sectionOrTopic || input.subject,
            }).map((o) => `${o.code} — ${o.text}`);

      const work = await generateSorSochWork({
        ...input,
        learningObjectives: objectives,
      });
      await quota.reservation.finalize(true);

      const db = await getDb();
      const inserted = await db.collection(COL.sorSochWorks).insertOne({
        owner_id: ctx.userId,
        work,
        created_at: new Date(),
      });
      const workId = inserted.insertedId.toHexString();

      return {
        success: true,
        workId,
        title: work.title,
        maxPoints: work.maxPoints,
        url: '/school/sor-soch',
        message: `Комплект «${work.title}» (2 варианта, дескрипторы, ключи и рубрика, ${work.maxPoints} б.) создан и сохранён. Открыть, скачать Word или провести онлайн по коду можно в разделе /school/sor-soch.`,
      };
    } catch (error) {
      await quota.reservation.finalize(false).catch(() => {});
      return {
        success: false,
        error: error instanceof Error ? `Не удалось создать СОР/СОЧ: ${error.message.slice(0, 180)}` : 'Не удалось создать комплект СОР/СОЧ',
      };
    }
  },

  createPresentation: async (args: Record<string, unknown>, ctx?: Ctx) => {
    if (!ctx?.userId) return { success: false, error: 'Нет пользователя сессии' };
    const parsed = createPresentationSchema.safeParse({
      planId: args.planId,
      theme: args.theme ?? 'network',
    });
    if (!parsed.success) {
      return { success: false, error: 'Некорректные параметры презентации (проверьте planId)' };
    }

    const targetId = await resolveTargetPlanId(ctx.userId, parsed.data.planId);
    if (!targetId) {
      return { success: false, error: 'Сначала создайте КСП через createKsp или передайте корректный planId' };
    }

    const { getPlanById } = await import('@/lib/plans-repo');
    const plan = await getPlanById(targetId);
    if (!plan || plan.owner_id !== ctx.userId) {
      return { success: false, error: 'План не найден среди ваших планов' };
    }

    const { reserveQuota } = await import('@/lib/billing/quota');
    const quota = await reserveQuota({ id: ctx.userId }, 'assist');
    if (!quota.ok) return { success: false, error: quota.message };

    try {
      const { generateDeckOutline } = await import('@/lib/materials/deck');
      const { savePlanMaterial } = await import('@/lib/materials/plan-materials');
      const { slides } = await generateDeckOutline(plan);
      await savePlanMaterial({
        planId: plan.id,
        ownerId: ctx.userId,
        kind: 'deck',
        stage: 'middle',
        title: `Презентация: ${plan.content.topic || plan.title}`.slice(0, 200),
        payload: { slides, theme: parsed.data.theme },
      });
      await quota.reservation.finalize(true);

      return {
        success: true,
        planId: plan.id,
        slideCount: slides.length,
        editorUrl: `/plans/${plan.id}/presentation`,
        pptxUrl: `/api/export/pptx/${plan.id}`,
        message: `Презентация из ${slides.length} слайдов создана и прикреплена к уроку. Конструктор и режим показа на доске: /plans/${plan.id}/presentation, скачать .pptx: /api/export/pptx/${plan.id}.`,
      };
    } catch (error) {
      await quota.reservation.finalize(false).catch(() => {});
      return {
        success: false,
        error: error instanceof Error ? `Не удалось собрать презентацию: ${error.message.slice(0, 180)}` : 'Не удалось собрать презентацию',
      };
    }
  },

  assignHomework: async (args: Record<string, unknown>, ctx?: Ctx) => {
    if (!ctx?.userId) return { success: false, error: 'Нет пользователя сессии' };
    const parsed = assignHomeworkSchema.safeParse({
      planId: args.planId,
      title: args.title,
      daysValid: args.daysValid ?? 14,
    });
    if (!parsed.success) {
      return { success: false, error: 'Некорректные параметры выдачи домашнего задания' };
    }

    const targetId = await resolveTargetPlanId(ctx.userId, parsed.data.planId);
    if (!targetId) {
      return { success: false, error: 'У вас ещё нет плана урока. Сначала создайте КСП через createKsp.' };
    }

    const { getPlanById, getSubjectById } = await import('@/lib/plans-repo');
    const plan = await getPlanById(targetId);
    if (!plan || plan.owner_id !== ctx.userId) {
      return { success: false, error: 'План не найден среди ваших планов' };
    }

    try {
      const subjectRow = plan.subject_id ? await getSubjectById(plan.subject_id).catch(() => null) : null;
      const subjectName = subjectRow?.name_ru ?? '';
      let tasks = [
        ...(plan.content.stages.beginning.tasks ?? []),
        ...(plan.content.stages.middle.tasks ?? []),
        ...(plan.content.stages.end.tasks ?? []),
      ];

      if (tasks.length === 0) {
        const { reserveQuota } = await import('@/lib/billing/quota');
        const quota = await reserveQuota({ id: ctx.userId }, 'assist');
        if (!quota.ok) return { success: false, error: quota.message };
        try {
          const { generateTasks } = await import('@/lib/ai/tasks');
          tasks = await generateTasks({
            topic: plan.content.topic || plan.title,
            grade: plan.grade,
            subject: subjectName || 'Предмет',
            stage: 'middle',
            language: plan.language,
            count: 5,
          });
          await quota.reservation.finalize(true);

          // Сохраним сгенерированные задания в середину урока
          const { getDb, COL, toObjectId } = await import('@/lib/mongo');
          const oid = toObjectId(plan.id);
          if (oid) {
            await (await getDb()).collection(COL.plans).updateOne(
              { _id: oid, owner_id: ctx.userId },
              { $set: { 'content.stages.middle.tasks': tasks, updated_at: new Date() } },
            );
          }
        } catch (err) {
          await quota.reservation.finalize(false).catch(() => {});
          throw err;
        }
      }

      const { createDirectAssignment } = await import('@/lib/assignments');
      const hwTitle = (parsed.data.title || `ДЗ: ${plan.content.topic || plan.title}`).slice(0, 200);
      const { id, code } = await createDirectAssignment(ctx.userId, {
        title: hwTitle,
        subject: subjectName || null,
        grade: plan.grade,
        tasks: tasks.slice(0, 20),
        daysValid: parsed.data.daysValid,
        source: { planId: plan.id },
      });

      return {
        success: true,
        assignmentId: id,
        code,
        taskCount: Math.min(tasks.length, 20),
        studentUrl: `/a/${code}`,
        resultsUrl: `/assignments/${id}`,
        message: `Онлайн-ДЗ «${hwTitle}» выдано! Код для учеников: ${code}, прямая ссылка: /a/${code}. Таблица результатов и QR-код: /assignments/${id}.`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? `Не удалось выдать ДЗ: ${error.message.slice(0, 180)}` : 'Не удалось создать онлайн-выдачу ДЗ',
      };
    }
  },

  createSchoolDoc: async (args: Record<string, unknown>, ctx?: Ctx) => {
    if (!ctx?.userId) return { success: false, error: 'Нет пользователя сессии' };
    const parsed = createSchoolDocSchema.safeParse({
      docType: args.docType,
      title: args.title,
      details: args.details,
      language: args.language ?? 'ru',
    });
    if (!parsed.success) {
      return { success: false, error: `Некорректные параметры школьного документа: ${parsed.error.issues.map((i) => i.message).join(', ')}` };
    }

    const { reserveQuota } = await import('@/lib/billing/quota');
    const quota = await reserveQuota({ id: ctx.userId }, 'assist');
    if (!quota.ok) return { success: false, error: quota.message };

    try {
      const { executeWithFallback } = await import('@/lib/ai/providers');
      const { getDb, COL } = await import('@/lib/mongo');
      const input = parsed.data;
      const isKz = input.language === 'kz';

      const roleByType: Record<typeof input.docType, string> = {
        'vsk-spravka': 'аналитическую справку по итогам внутришкольного контроля (ВШК)',
        characteristic: 'официальную психолого-педагогическую характеристику на учащегося',
        homeroom: 'сценарий и разработку классного часа / воспитательного мероприятия по программе «Біртұтас тәрбие»',
        iom: 'индивидуальный образовательный маршрут (ИОМ) учащегося с планом коррекции и поддержки',
      };

      const urlByType: Record<typeof input.docType, string> = {
        'vsk-spravka': '/school/vsk',
        characteristic: '/school/characteristics',
        homeroom: '/school/homeroom',
        iom: '/school/iom',
      };

      const content = await executeWithFallback(
        'generation',
        async (client, model, config, signal) => {
          const resp = await client.chat.completions.create(
            {
              model,
              temperature: 0.4,
              max_completion_tokens: config.maxTokens ?? 4096,
              messages: [
                {
                  role: 'system',
                  content: `Ты — опытный методист и завуч общеобразовательной школы Республики Казахстан (МП РК). Составь ${roleByType[input.docType]} на ${isKz ? 'казахском' : 'русском'} языке в чистом Markdown (шапка, разделы, конкретные выводы и рекомендации, готовые к печати).`,
                },
                {
                  role: 'user',
                  content: `Тема / заголовок: ${input.title}\nВводные данные: ${input.details}`,
                },
              ],
            },
            { signal: ctx.signal ?? signal },
          );
          const text = resp.choices[0]?.message?.content?.trim();
          if (!text) throw new Error('Пустой ответ модели');
          return text;
        },
      );

      await quota.reservation.finalize(true);
      const db = await getDb();
      const inserted = await db.collection(COL.schoolAiDocs).insertOne({
        owner_id: ctx.userId,
        tool: input.docType,
        title: input.title,
        content,
        created_at: new Date(),
      });
      const docId = inserted.insertedId.toHexString();
      const file = await saveCopyToWorkspace(
        ctx.userId,
        `${input.docType}-${slugForFile(input.title)}.md`,
        content,
      );

      return {
        success: true,
        docId,
        docType: input.docType,
        title: input.title,
        url: urlByType[input.docType],
        ...(file ? { file } : {}),
        message: `Документ «${input.title}» сформирован и сохранён в разделе ${urlByType[input.docType]}.`,
      };
    } catch (error) {
      await quota.reservation.finalize(false).catch(() => {});
      return {
        success: false,
        error: error instanceof Error ? `Не удалось составить документ: ${error.message.slice(0, 180)}` : 'Не удалось сформировать школьный документ',
      };
    }
  },
};
