import Link from "next/link";
import { notFound } from "next/navigation";
import { getAccessiblePlan, getSubjectById } from "@/lib/plans-repo";
import { getCurrentUser } from "@/lib/auth";
import { getDb, COL, isMongoConfigured } from "@/lib/mongo";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PlanView } from "@/components/ksp/plan-view";
import { PrintButton } from "@/components/ksp/print-button";
import { ClonePlanButton } from "@/components/ksp/clone-plan-button";
import { CrosswordButton, MemosButton, WorksheetButton } from "@/components/ksp/handouts-button";
import { InteractiveButton, TeacherSpeechButton } from "@/components/ksp/materials-buttons";
import { KtpBuilder } from "@/components/ksp/ktp-builder";
import { LikeButton } from "@/components/ksp/like-button";
import { ReportPlanButton } from "@/components/ksp/report-plan-button";
import { DeletePlanButton } from "@/components/ksp/delete-plan-button";
import { AssignHomeworkButton } from "@/components/assignments/assign-homework-button";
import { QualityGate } from "@/components/ksp/quality-gate";
import { QrCard } from "@/components/ksp/qr-card";
import { SaveTemplateButton } from "@/components/templates/save-template-button";
import { CommentsSection } from "@/components/ksp/comments-section";
import { ReviewSection } from "@/components/ksp/review-section";
import { SchoolApprovalPanel } from "@/components/school/school-approval-panel";
import { schoolApprovalCopy } from "@/lib/school-approval-copy";
import { getActiveSchool } from "@/lib/school/active";
import { getDict } from "@/lib/i18n/server";
import { getSchoolClasses, requireSchoolAccess } from "@/lib/school";
import { getAssignedSchoolClassNames } from "@/lib/school-permissions";
import { hasSchoolPermission } from "@/lib/school/role-matrix";
import { siteUrl } from "@/lib/site";
import { resolveWatermark } from "@/lib/billing/watermark";
import { getComments, getReviews, getUserNames } from "@/lib/comments";
import { log } from "@/lib/logger";
import type { LessonPlanRow } from "@/lib/types/ksp";
import { Archive, Download, Edit, FileSpreadsheet, Gamepad2, Grid3x3, History as HistoryIcon, Layers, MessageSquareText, Presentation, Printer, Radio, ScrollText } from "lucide-react";
import { ThreeStage } from "@/components/three/three-stage";
import l from "@/components/app/lesson.module.css";

export const dynamic = "force-dynamic";

interface PlanLikeDoc {
  _id: string;
  user_id: string;
  plan_id: string;
  createdAt: Date;
}

function hasTasks(plan: LessonPlanRow): boolean {
  const s = plan.content?.stages;
  if (!s) return false;
  return Boolean(
    (s.beginning.tasks?.length ?? 0) +
      (s.middle.tasks?.length ?? 0) +
      (s.end.tasks?.length ?? 0),
  );
}

export default async function PlanViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  // Mongo из Казахстанских сетей отвечает медленно и иногда падает целиком.
  // Раньше это давало 500 на весь экран; теперь — понятное сообщение с
  // предложением повторить, а стек ошибки уходит в лог.
  let plan: Awaited<ReturnType<typeof getAccessiblePlan>>;
  try {
    plan = await getAccessiblePlan(id, user?.id ?? null);
  } catch (error) {
    log.error("Не удалось загрузить план", {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle className="editorial-display text-3xl">База данных недоступна</CardTitle>
            <CardDescription>
              Не удалось связаться с архивом планов. Проверьте соединение и обновите страницу через минуту.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  if (!plan) notFound();

  // Resolve subject name for handouts (need plain text for AI prompt).
  let subjectName = "—";
  if (plan.subject_id) {
    const subj = await getSubjectById(plan.subject_id);
    if (subj?.name_ru) subjectName = subj.name_ru;
  }

  const isOwner = user?.id === plan.owner_id;
  const [approvalSchool, dict] = await Promise.all([
    isOwner && user ? getActiveSchool(user.id) : Promise.resolve(null),
    getDict(),
  ]);
  const approvalLocale = dict.locale;
  const approvalCopy = schoolApprovalCopy[approvalLocale];
  let approvalClassNames: string[] = [];
  if (approvalSchool?._id && user && isOwner) {
    const schoolId = approvalSchool._id.toString();
    const member = await requireSchoolAccess(user.id, schoolId);
    if (hasSchoolPermission(member.role, member.granted_permissions, "school:students:read_all")) {
      approvalClassNames = await getSchoolClasses(schoolId);
    } else if (hasSchoolPermission(member.role, member.granted_permissions, "school:students:read_assigned")) {
      approvalClassNames = await getAssignedSchoolClassNames(schoolId, user.id);
    }
  }

  // Контекст урока для всех раздаточных (лист, памятки, кроссворд).
  const handoutKspContext = plan.content ? {
    learningObjectives: plan.content.learningObjectives?.map(obj => `${obj.code} ${obj.text}`) || [],
    assessmentCriteria: plan.content.assessmentCriteria || [],
    stages: [
      { stage: "start", activities: plan.content.stages?.beginning?.studentActions || "" },
      { stage: "middle", activities: plan.content.stages?.middle?.studentActions || "" },
      { stage: "end", activities: plan.content.stages?.end?.studentActions || "" },
    ],
  } : undefined;

  // Лайки: счётчик + лайкнул ли текущий пользователь.
  let likes = 0;
  let liked = false;
  try {
    if (isMongoConfigured()) {
      const db = await getDb();
      const likesCollection = db.collection<PlanLikeDoc>(COL.planLikes);
      likes = await likesCollection.countDocuments({ plan_id: plan.id });
      if (user && !isOwner) {
        liked = Boolean(
          await likesCollection.findOne({ _id: `${user.id}:${plan.id}` }),
        );
      }
    }
  } catch {
    // Счётчик лайков некритичен.
  }

  // Комментарии и отзывы.
  interface CommentWithAuthor {
    id: string;
    plan_id: string;
    user_id: string;
    text: string;
    parent_id: string | null;
    created_at: string;
    updated_at: string;
    author: { name: string; email: string };
  }
  interface ReviewWithReviewer {
    id: string;
    plan_id: string;
    reviewer_id: string;
    rating: number;
    feedback: string;
    created_at: string;
    reviewer: { name: string; email: string };
  }
  let comments: CommentWithAuthor[] = [];
  let reviews: ReviewWithReviewer[] = [];
  let reviewAverage = 0;
  let reviewCount = 0;
  try {
    if (isMongoConfigured() && user) {
      const rawComments = await getComments(plan.id);
      const userIds = rawComments.map((c) => c.user_id);
      const names = await getUserNames(userIds);
      comments = rawComments.map((c) => ({
        ...c,
        author: names.get(c.user_id)
          ? { name: names.get(c.user_id)!.fullName || names.get(c.user_id)!.email, email: names.get(c.user_id)!.email }
          : { name: "Пользователь", email: "" },
      }));

      const rawReviews = await getReviews(plan.id);
      const reviewerIds = rawReviews.map((r) => r.reviewer_id);
      const reviewerNames = await getUserNames(reviewerIds);
      reviews = rawReviews.map((r) => ({
        ...r,
        reviewer: reviewerNames.get(r.reviewer_id)
          ? { name: reviewerNames.get(r.reviewer_id)!.fullName || reviewerNames.get(r.reviewer_id)!.email, email: reviewerNames.get(r.reviewer_id)!.email }
          : { name: "Пользователь", email: "" },
      }));
      reviewCount = reviews.length;
      reviewAverage = reviewCount > 0
        ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount) * 10) / 10
        : 0;
    }
  } catch {
    // Комментарии и отзывы некритичны.
  }

  const allTasks = [
    ...(plan.content?.stages?.beginning?.tasks || []),
    ...(plan.content?.stages?.middle?.tasks || []),
    ...(plan.content?.stages?.end?.tasks || [])
  ];
  // Печатная версия (PDF через браузер) — с пометкой для Free/анонима.
  const printWatermark = await resolveWatermark(user);
  // КТП — фича Pro: флаг для билдера (сам роут тоже проверяет тариф).
  let canUseKtp = true;
  if (user) {
    try {
      const { getPlanForUser } = await import("@/lib/billing/quota");
      canUseKtp = (await getPlanForUser(user.id)).limits.ktp === true;
    } catch {
      canUseKtp = true; // при сбое биллинга решает серверный роут
    }
  }
  return (
    <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-4 md:px-6">
      <header className={`${l.banner} no-print`}>
        <div className={l.bannerCopy}>
          <p className={l.bannerMeta}>{[subjectName, `${plan.grade} класс`].filter(Boolean).join(" · ")}</p>
          <h1 className={l.bannerTitle}>{plan.content?.topic || plan.title}</h1>
          <div className={l.bannerActions}>
            {isOwner && (
              <AssignHomeworkButton
                planId={plan.id}
                planTitle={plan.title}
                subject={subjectName}
                grade={plan.grade}
                planTasks={allTasks.map((t, i) => ({
                  ref: `${plan.id}:${i}`,
                  question: t.question,
                  type: t.type,
                  points: t.points,
                  from: plan.title,
                }))}
              />
            )}
            <Button asChild variant="outline">
              <a href={`/api/export/docx/${plan.id}`}><Download /> Word</a>
            </Button>
            {isOwner && (
              <Button asChild variant="outline">
                <Link href={`/plans/${plan.id}/edit`}><Edit /> Редактировать</Link>
              </Button>
            )}
            <PrintButton><Printer /> PDF</PrintButton>
            <LikeButton planId={plan.id} initialLikes={likes} initiallyLiked={liked} canLike={Boolean(user) && !isOwner} />
          </div>
        </div>
        <div className={l.bannerRobot}><ThreeStage scene="robot" className={l.fill} /></div>
      </header>

      <section id="materials" aria-labelledby="materials-title" className={`${l.section} no-print`}>
        <h2 id="materials-title" className={l.sectionTitle}>Материалы урока</h2>
        <div className={l.tiles}>
          <div className={l.tile} data-tone="violet"><Gamepad2 aria-hidden="true" className={l.tileIcon} /><b>Интерактив</b><p>Live-квиз, пропуски, пары, порядок: выберите формат.</p>
            {isOwner ? <InteractiveButton planId={plan.id} /> : <p className={l.note}>Доступен автору плана.</p>}
            {isOwner && hasTasks(plan) && <Button asChild variant="outline"><Link href={`/quiz/host/${plan.id}`}><Radio /> Live-квиз</Link></Button>}
          </div>
          <div className={l.tile} data-tone="blue"><FileSpreadsheet aria-hidden="true" className={l.tileIcon} /><b>Рабочий лист</b><p>Красочный лист A4: картинка для печати, PDF или Word.</p>
            <WorksheetButton planId={plan.id} topic={plan.content?.topic || plan.title} subject={subjectName} grade={plan.grade} language={plan.language} kspContext={handoutKspContext} footer={plan.content.header.school || plan.content.header.teacherName || undefined} />
          </div>
          <div className={l.tile} data-tone="peach"><MessageSquareText aria-hidden="true" className={l.tileIcon} /><b>Слова педагога</b><p>Живая речь учителя по этапам, в Word.</p>
            {user ? <TeacherSpeechButton planId={plan.id} /> : <Button asChild variant="outline"><a href={`/api/export/teacher-script/${plan.id}`}><ScrollText /> Слова педагога</a></Button>}
          </div>
          <div className={l.tile} data-tone="green"><Grid3x3 aria-hidden="true" className={l.tileIcon} /><b>Кроссворд</b><p>Из терминов этой темы.</p>
            <CrosswordButton planId={plan.id} topic={plan.content?.topic || plan.title} subject={subjectName} grade={plan.grade} language={plan.language} kspContext={handoutKspContext} />
          </div>
          <div className={l.tile} data-tone="pink"><Layers aria-hidden="true" className={l.tileIcon} /><b>Карточки в тетрадь</b><p>Печатаются, вырезаются и вклеиваются в тетрадь.</p>
            <MemosButton planId={plan.id} topic={plan.content?.topic || plan.title} subject={subjectName} grade={plan.grade} language={plan.language} kspContext={handoutKspContext} footer={plan.content.header.school || plan.content.header.teacherName || undefined} />
          </div>
          <div className={l.tile} data-tone="gray"><Presentation aria-hidden="true" className={l.tileIcon} /><b>Презентация</b><p>ИИ разбирает КСП, вы правите слайды, на выходе PowerPoint с анимацией.</p>
            <div className={l.tileRow}>
              {isOwner
                ? <Button asChild variant="outline"><Link href={`/plans/${plan.id}/presentation`}><Presentation /> Конструктор</Link></Button>
                : <Button asChild variant="outline"><a href={`/api/export/pptx/${plan.id}`}><Presentation /> PowerPoint</a></Button>}
              <Button asChild variant="outline"><a href={`/api/export/zip/${plan.id}`}><Archive /> ZIP</a></Button>
            </div>
          </div>
        </div>
        {isOwner && <KtpBuilder planId={plan.id} topic={plan.content.topic || plan.title} isPro={canUseKtp} grade={plan.grade} subjectId={plan.subject_id} language={plan.language} />}
      </section>

      <details className={`${l.more} no-print`}>
        <summary>Ещё по уроку: проверка качества, согласование, история</summary>
        <div className={l.moreBody}>
          <div className={l.tileRow}>
            {isOwner && <Button asChild variant="outline"><Link href={`/plans/${plan.id}/history`}><HistoryIcon /> История</Link></Button>}
            {user && <ClonePlanButton planId={plan.id} />}
            {isOwner && <SaveTemplateButton plan={plan} />}
            {user && !isOwner && plan.visibility === "public" && <ReportPlanButton planId={plan.id} />}
          </div>
          {isOwner && <QualityGate content={plan.content} planId={plan.id} language={plan.language} />}
          {isOwner && (approvalSchool?._id ? (
            <SchoolApprovalPanel schoolId={approvalSchool._id.toString()} planId={plan.id} currentUpdatedAt={plan.updated_at} locale={approvalLocale} mode="owner" availableClasses={approvalClassNames} initialClassName={plan.content.header.grade} />
          ) : (
            <Card><CardHeader><CardTitle>{approvalCopy.queueTitle}</CardTitle><CardDescription>{approvalCopy.noSchool} <Link className="underline" href="/school">{approvalCopy.open}</Link></CardDescription></CardHeader></Card>
          ))}
          {isOwner && !plan.moderationHidden && <div className="max-w-xs"><QrCard url={`${siteUrl}/plans/${plan.id}`} title={plan.title} /></div>}
          {isOwner && <div className={l.danger}><DeletePlanButton planId={plan.id} /></div>}
        </div>
      </details>
      {plan.moderationHidden && (
        <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 no-print">
          План скрыт модерацией и не виден другим пользователям. {isOwner && "Проверьте содержание и смените видимость после исправлений — скрытие снимет администратор."}
        </p>
      )}
      <PlanView plan={plan} />
      {user && (
        <div className="space-y-6 no-print">
          <CommentsSection planId={plan.id} initialComments={comments} isOwner={isOwner} />
          <ReviewSection
            planId={plan.id}
            initialReviews={reviews}
            initialAverage={reviewAverage}
            initialCount={reviewCount}
            isOwner={isOwner}
            canReview={Boolean(user) && !isOwner}
          />
        </div>
      )}
      {printWatermark && (
        <p className="print-watermark">Создано в Mekty — бесплатный тариф</p>
      )}
    </div>
  );
}
