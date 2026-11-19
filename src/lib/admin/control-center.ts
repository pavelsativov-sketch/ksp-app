import "server-only";
import { COL, getDb } from "@/lib/mongo";
import { requireAdmin, limitAdmin } from "./auth";
import { getUserNames } from "@/lib/comments";
import { getAnalyticsSummary, getEngagementMetrics } from "@/lib/analytics";

const QUERY_OPTS = { maxTimeMS: 10_000 };

export interface EnvServiceStatus {
  key: string;
  name: string;
  group: "text_ai" | "media_ai" | "infra";
  configured: boolean;
  hint: string;
}

export interface ProviderHealthRow {
  provider: string;
  model: string;
  calls: number;
  okCount: number;
  failCount: number;
  successRate: number;
  avgDurationMs: number;
  lastError: string | null;
  lastSeenAt: string | null;
}

export interface AdminSchoolRow {
  id: string;
  name: string;
  code: string;
  city: string;
  region: string;
  academicYear: string;
  membersCount: number;
  studentsCount: number;
  createdAt: string | null;
}

export interface AdminPlanRow {
  id: string;
  title: string;
  grade: number;
  language: string;
  visibility: string;
  hidden: boolean;
  ownerId: string;
  ownerEmail: string | null;
  ownerName: string | null;
  likesCount: number;
  viewsCount: number;
  createdAt: string | null;
}

export interface AdminAuditRow {
  id: string;
  action: string;
  adminId: string;
  adminEmail: string | null;
  targetUserId: string;
  targetEmail: string | null;
  summary: string;
  at: string | null;
}

export interface AdminExtraCounts {
  totalPlans: number;
  publicPlans: number;
  sorSochCount: number;
  schoolDocsCount: number;
  journalStudentsCount: number;
  assignmentsCount: number;
}

export interface AdminControlCenterExtras {
  envStatuses: EnvServiceStatus[];
  providerHealth: ProviderHealthRow[];
  schools: AdminSchoolRow[];
  recentPlans: AdminPlanRow[];
  auditRows: AdminAuditRow[];
  counts: AdminExtraCounts;
  siteAnalytics: {
    pageViews30d: number;
    exports30d: number;
    returningUsers30d: number;
    topPages: Array<{ path: string; views: number }>;
  };
  userEmailMap: Record<string, { email: string; name: string }>;
}

function hasEnv(name: string): boolean {
  const val = process.env[name]?.trim();
  return Boolean(val && val.length > 0);
}

export function inspectEnvServices(): EnvServiceStatus[] {
  return [
    {
      key: "MERCURY_API_KEY",
      name: "Inception Mercury 3",
      group: "text_ai",
      configured: hasEnv("MERCURY_API_KEY"),
      hint: "Основной быстрый генератор КСП и рабочих листов",
    },
    {
      key: "GROQ_API_KEY",
      name: "Groq Cloud (GPT-OSS / Qwen)",
      group: "text_ai",
      configured: hasEnv("GROQ_API_KEY"),
      hint: "Сверхбыстрый текстовый фоллбэк и инструменты агента",
    },
    {
      key: "MXR_API_KEY",
      name: "MXR (GPT-6.1 Terra / Luna)",
      group: "text_ai",
      configured: hasEnv("MXR_API_KEY"),
      hint: "Резервный генератор КСП и методических материалов",
    },
    {
      key: "KENARI_API_KEY",
      name: "Kenari (Nemotron Ultra)",
      group: "text_ai",
      configured: hasEnv("KENARI_API_KEY"),
      hint: "Резервная большая модель для генерации и правок",
    },
    {
      key: "GEMINI_API_KEY",
      name: "Google Gemini API",
      group: "text_ai",
      configured: hasEnv("GEMINI_API_KEY"),
      hint: "Мультимодальная модель для текста, зрения и иллюстраций",
    },
    {
      key: "CEREBRAS_API_KEY",
      name: "Cerebras Inference",
      group: "text_ai",
      configured: hasEnv("CEREBRAS_API_KEY"),
      hint: "Высокоскоростной резервный текстовый провайдер",
    },
    {
      key: "OPENROUTER_API_KEY",
      name: "OpenRouter",
      group: "text_ai",
      configured: hasEnv("OPENROUTER_API_KEY"),
      hint: "Аварийный шлюз к открытым бесплатным моделям",
    },
    {
      key: "CLOUDFLARE_API_TOKEN",
      name: "Cloudflare Workers AI (FLUX)",
      group: "media_ai",
      configured: hasEnv("CLOUDFLARE_ACCOUNT_ID") && hasEnv("CLOUDFLARE_API_TOKEN"),
      hint: "Генерация иллюстраций FLUX.1 / FLUX.2 (10 000 нейронов/сутки бесплатно)",
    },
    {
      key: "POLLINATIONS_ENABLED",
      name: "Pollinations Flux (Резерв)",
      group: "media_ai",
      configured: process.env.POLLINATIONS_ENABLED === "1",
      hint: "Бесплатный безключевой резерв иллюстраций при лимитах Cloudflare",
    },
    {
      key: "PRESENTON_API_KEY",
      name: "Presenton Cloud v3 (.pptx)",
      group: "media_ai",
      configured: hasEnv("PRESENTON_API_KEY"),
      hint: "Дизайнерские презентации PowerPoint по плану урока",
    },
    {
      key: "VOYAGE_API_KEY",
      name: "Voyage AI Embeddings",
      group: "infra",
      configured: hasEnv("VOYAGE_API_KEY"),
      hint: "Векторный поиск по загруженным учебникам (RAG)",
    },
    {
      key: "RESEND_API_KEY",
      name: "Resend (Почтовый шлюз)",
      group: "infra",
      configured: hasEnv("RESEND_API_KEY"),
      hint: hasEnv("RESEND_API_KEY")
        ? "Автоматическая отправка писем сброса пароля и алертов включена"
        : "Не задан — запросы сброса пароля приходят заявками во «Входящие» админки",
    },
    {
      key: "MAIL_FROM",
      name: "Отправитель писем (домен)",
      group: "infra",
      configured: hasEnv("MAIL_FROM"),
      hint: hasEnv("MAIL_FROM")
        ? `Текущий адрес: ${process.env.MAIL_FROM}`
        : "Используется тестовый адрес onboarding@resend.dev — задайте подтверждённый домен в Resend",
    },
    {
      key: "TELEGRAM_BOT_TOKEN",
      name: "Telegram-оповещения админу",
      group: "infra",
      configured: hasEnv("TELEGRAM_BOT_TOKEN") && hasEnv("TELEGRAM_ADMIN_CHAT_ID"),
      hint:
        hasEnv("TELEGRAM_BOT_TOKEN") && hasEnv("TELEGRAM_ADMIN_CHAT_ID")
          ? "Мгновенные уведомления о заявках Pro/Школа и сбросах пароля активны"
          : "Добавьте TELEGRAM_BOT_TOKEN и TELEGRAM_ADMIN_CHAT_ID для мгновенных алертов в Telegram",
    },
    {
      key: "APP_URL",
      name: "Базовый URL продакшена",
      group: "infra",
      configured: hasEnv("APP_URL"),
      hint: hasEnv("APP_URL")
        ? `Ссылки в письмах ведут на ${process.env.APP_URL}`
        : "Задайте https://... для генерации рабочих ссылок в письмах",
    },
  ];
}

function formatAuditPayload(action: string, raw: unknown): string {
  if (!raw || typeof raw !== "object") return "—";
  const p = raw as Record<string, unknown>;
  if (action === "password_reset_link") {
    return `Email: ${String(p.email ?? "—")}`;
  }
  if (action === "grant_pro" || action === "set_subscription") {
    const parts: string[] = [];
    if (p.email) parts.push(String(p.email));
    if (p.type) parts.push(`тариф ${String(p.type)}`);
    if (p.action) parts.push(`действие: ${String(p.action)}`);
    if (p.months) parts.push(`${String(p.months)} мес.`);
    if (p.expiresAt) parts.push(`до ${String(p.expiresAt).slice(0, 10)}`);
    return parts.join(" · ") || JSON.stringify(p);
  }
  if (action === "grant_tokens") {
    const amt = Number(p.amount ?? 0);
    return `${amt > 0 ? `+${amt}` : amt} КСП (${p.scope === "permanent" ? "ежемесячно" : "на месяц"})`;
  }
  if (action === "create_code" || action === "create_codes_bulk") {
    return `Выпуск кодов: ${String(p.type ?? "pro")}${p.count ? ` × ${String(p.count)} шт.` : ""}`;
  }
  if (action === "revoke_code") {
    return `Отзыв кода ID ${String(p.codeId ?? p.id ?? "—")}`;
  }
  return JSON.stringify(p).slice(0, 160);
}

export async function getAdminControlCenterExtras(
  extraUserIdsToResolve: string[] = [],
): Promise<AdminControlCenterExtras> {
  const admin = await requireAdmin();
  await limitAdmin(admin.id, "read");

  const db = await getDb();
  const since30d = new Date(Date.now() - 30 * 86_400_000);

  const [
    providerAgg,
    schoolsRaw,
    plansRaw,
    auditRaw,
    totalPlans,
    publicPlans,
    sorSochCount,
    schoolDocsCount,
    journalStudentsCount,
    assignmentsCount,
    analyticsSummary,
    engagement,
  ] = await Promise.all([
    db
      .collection(COL.aiEvents)
      .aggregate<{
        _id: { provider: string; model: string };
        calls: number;
        okCount: number;
        failCount: number;
        avgDuration: number;
        lastError: string | null;
        lastSeen: Date | null;
      }>(
        [
          {
            $match: {
              createdAt: { $gte: since30d },
              provider: { $type: "string" },
              ok: { $type: "bool" },
            },
          },
          { $sort: { createdAt: -1 } },
          {
            $group: {
              _id: { provider: "$provider", model: { $ifNull: ["$model", "—"] } },
              calls: { $sum: 1 },
              okCount: { $sum: { $cond: ["$ok", 1, 0] } },
              failCount: { $sum: { $cond: ["$ok", 0, 1] } },
              avgDuration: { $avg: "$duration_ms" },
              lastError: {
                $first: {
                  $cond: [{ $eq: ["$ok", false] }, "$error", null],
                },
              },
              lastSeen: { $max: "$createdAt" },
            },
          },
          { $sort: { calls: -1 } },
          { $limit: 25 },
        ],
        QUERY_OPTS,
      )
      .toArray()
      .catch(() => []),
    db
      .collection(COL.schools)
      .find({}, QUERY_OPTS)
      .sort({ created_at: -1 })
      .limit(30)
      .toArray()
      .catch(() => []),
    db
      .collection(COL.plans)
      .find(
        {},
        {
          ...QUERY_OPTS,
          projection: {
            _id: 1,
            title: 1,
            grade: 1,
            language: 1,
            visibility: 1,
            moderation_hidden: 1,
            owner_id: 1,
            likes_count: 1,
            views_count: 1,
            created_at: 1,
          },
        },
      )
      .sort({ created_at: -1 })
      .limit(30)
      .toArray()
      .catch(() => []),
    db
      .collection(COL.adminActions)
      .find({}, QUERY_OPTS)
      .sort({ at: -1 })
      .limit(40)
      .toArray()
      .catch(() => []),
    db.collection(COL.plans).countDocuments({}, QUERY_OPTS).catch(() => 0),
    db
      .collection(COL.plans)
      .countDocuments({ visibility: "public", moderation_hidden: { $ne: true } }, QUERY_OPTS)
      .catch(() => 0),
    db.collection(COL.sorSochWorks).countDocuments({}, QUERY_OPTS).catch(() => 0),
    db.collection(COL.schoolAiDocs).countDocuments({}, QUERY_OPTS).catch(() => 0),
    db.collection(COL.journalStudents).countDocuments({}, QUERY_OPTS).catch(() => 0),
    db.collection(COL.assignments).countDocuments({}, QUERY_OPTS).catch(() => 0),
    getAnalyticsSummary(30).catch(() => ({
      totalEvents: 0,
      pageViews: 0,
      planCreations: 0,
      aiGenerations: 0,
      exports: 0,
      errors: 0,
      topPages: [],
      topEvents: [],
    })),
    getEngagementMetrics(30).catch(() => ({ avgEventsPerUser: 0, returningUsers: 0 })),
  ]);

  const schoolIds = schoolsRaw.map((s) => s._id.toHexString());
  const [schoolMemberCounts, schoolStudentCounts] =
    schoolIds.length > 0
      ? await Promise.all([
          db
            .collection(COL.schoolMembers)
            .aggregate<{ _id: string; count: number }>(
              [
                { $match: { school_id: { $in: schoolIds } } },
                { $group: { _id: "$school_id", count: { $sum: 1 } } },
              ],
              QUERY_OPTS,
            )
            .toArray()
            .catch(() => []),
          db
            .collection(COL.students)
            .aggregate<{ _id: string; count: number }>(
              [
                { $match: { school_id: { $in: schoolIds } } },
                { $group: { _id: "$school_id", count: { $sum: 1 } } },
              ],
              QUERY_OPTS,
            )
            .toArray()
            .catch(() => []),
        ])
      : [[], []];

  const memberCountMap = new Map(schoolMemberCounts.map((r) => [r._id, r.count]));
  const studentCountMap = new Map(schoolStudentCounts.map((r) => [r._id, r.count]));

  const allUserIds = new Set<string>(extraUserIdsToResolve.filter(Boolean));
  for (const p of plansRaw) {
    if (typeof p.owner_id === "string") allUserIds.add(p.owner_id);
  }
  for (const a of auditRaw) {
    if (typeof a.admin_id === "string") allUserIds.add(a.admin_id);
    if (typeof a.target_user_id === "string") allUserIds.add(a.target_user_id);
  }

  const namesMap =
    allUserIds.size > 0
      ? await getUserNames([...allUserIds]).catch(() => new Map())
      : new Map();

  const userEmailMap: Record<string, { email: string; name: string }> = {};
  for (const [uid, info] of namesMap.entries()) {
    userEmailMap[uid] = { email: info.email ?? "", name: info.name ?? "" };
  }

  return {
    envStatuses: inspectEnvServices(),
    providerHealth: providerAgg.map((row) => ({
      provider: row._id.provider,
      model: row._id.model,
      calls: row.calls,
      okCount: row.okCount,
      failCount: row.failCount,
      successRate: row.calls > 0 ? Math.round((row.okCount / row.calls) * 100) : 100,
      avgDurationMs: Math.round(row.avgDuration ?? 0),
      lastError: typeof row.lastError === "string" ? row.lastError.slice(0, 180) : null,
      lastSeenAt: row.lastSeen instanceof Date ? row.lastSeen.toISOString() : null,
    })),
    schools: schoolsRaw.map((s) => {
      const sid = s._id.toHexString();
      return {
        id: sid,
        name: typeof s.name === "string" ? s.name : "Без названия",
        code: typeof s.code === "string" ? s.code : "—",
        city: typeof s.city === "string" ? s.city : "—",
        region: typeof s.region === "string" ? s.region : "—",
        academicYear: typeof s.academic_year === "string" ? s.academic_year : "—",
        membersCount: memberCountMap.get(sid) ?? 0,
        studentsCount: studentCountMap.get(sid) ?? 0,
        createdAt: s.created_at instanceof Date ? s.created_at.toISOString() : null,
      };
    }),
    recentPlans: plansRaw.map((p) => {
      const ownerId = typeof p.owner_id === "string" ? p.owner_id : "";
      const owner = namesMap.get(ownerId);
      return {
        id: p._id.toHexString(),
        title: typeof p.title === "string" && p.title.trim() ? p.title : "Без названия",
        grade: typeof p.grade === "number" ? p.grade : 0,
        language: typeof p.language === "string" ? p.language : "ru",
        visibility: typeof p.visibility === "string" ? p.visibility : "private",
        hidden: Boolean(p.moderation_hidden),
        ownerId,
        ownerEmail: owner?.email ?? null,
        ownerName: owner?.name ?? null,
        likesCount: typeof p.likes_count === "number" ? p.likes_count : 0,
        viewsCount: typeof p.views_count === "number" ? p.views_count : 0,
        createdAt: p.created_at instanceof Date ? p.created_at.toISOString() : null,
      };
    }),
    auditRows: auditRaw.map((a) => {
      const adminId = typeof a.admin_id === "string" ? a.admin_id : "";
      const targetId = typeof a.target_user_id === "string" ? a.target_user_id : "";
      const action = typeof a.action === "string" ? a.action : "unknown";
      return {
        id: a._id.toHexString(),
        action,
        adminId,
        adminEmail: namesMap.get(adminId)?.email ?? null,
        targetUserId: targetId,
        targetEmail: namesMap.get(targetId)?.email ?? null,
        summary: formatAuditPayload(action, a.payload),
        at: a.at instanceof Date ? a.at.toISOString() : null,
      };
    }),
    counts: {
      totalPlans,
      publicPlans,
      sorSochCount,
      schoolDocsCount,
      journalStudentsCount,
      assignmentsCount,
    },
    siteAnalytics: {
      pageViews30d: analyticsSummary.pageViews,
      exports30d: analyticsSummary.exports,
      returningUsers30d: engagement.returningUsers,
      topPages: analyticsSummary.topPages.slice(0, 10).map((tp) => ({
        path: tp._id,
        views: tp.count,
      })),
    },
    userEmailMap,
  };
}
