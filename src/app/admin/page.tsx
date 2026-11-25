import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminError } from "@/lib/admin/auth";
import { adminMetadata } from "@/lib/admin/page-guard";
import { getAdminDashboard, type AdminSearchParams } from "@/lib/admin/queries";
import {
  listHiddenPlans,
  listModerationQueue,
  type HiddenPlanItem,
  type ModerationQueueItem,
} from "@/lib/moderation";
import { getFeedback } from "@/lib/feedback";
import { getUserNames } from "@/lib/comments";
import { getAdminOverview, type AdminOverview } from "@/lib/admin/users";
import {
  getAdminControlCenterExtras,
  inspectEnvServices,
  type AdminControlCenterExtras,
} from "@/lib/admin/control-center";
import { type AdminFeedbackRow } from "@/components/admin/feedback-inbox";
import { AdminShell, type AdminTabId } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const generateMetadata = adminMetadata("Админ-панель — Mekty");

const VALID_ADMIN_TABS: readonly AdminTabId[] = [
  "overview",
  "inbox",
  "users",
  "billing",
  "ai",
  "content",
  "audit",
];

function resolveInitialTab(params: AdminSearchParams): AdminTabId {
  const rawTab = typeof params.tab === "string" ? params.tab : "";
  if ((VALID_ADMIN_TABS as readonly string[]).includes(rawTab)) {
    return rawTab as AdminTabId;
  }
  if (typeof params.q === "string" && params.q.trim()) return "users";
  if (typeof params.codePage === "string" || (typeof params.status === "string" && params.status !== "all")) {
    return "billing";
  }
  return "overview";
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<AdminSearchParams>;
}) {
  const params = await searchParams;
  const initialTab = resolveInitialTab(params);

  let data: Awaited<ReturnType<typeof getAdminDashboard>>;
  let queue: ModerationQueueItem[] = [];
  let hiddenPlans: HiddenPlanItem[] = [];
  let overview: AdminOverview | null = null;
  let feedbackRows: AdminFeedbackRow[] = [];
  let extras: AdminControlCenterExtras;

  try {
    data = await getAdminDashboard(params);

    const codeUserIds = data.codes
      .flatMap((c) => [c.createdBy, c.redeemedBy, c.revokedBy])
      .filter((id): id is string => Boolean(id));

    const [q, h, ov, fb, ext] = await Promise.all([
      listModerationQueue().catch(() => []),
      listHiddenPlans().catch(() => []),
      getAdminOverview().catch(() => null),
      getFeedback("admin", { limit: 80 }).catch(() => ({ feedback: [], total: 0 })),
      getAdminControlCenterExtras(codeUserIds).catch(
        (): AdminControlCenterExtras => ({
          envStatuses: inspectEnvServices(),
          providerHealth: [],
          schools: [],
          recentPlans: [],
          auditRows: [],
          counts: {
            totalPlans: 0,
            publicPlans: 0,
            sorSochCount: 0,
            schoolDocsCount: 0,
            journalStudentsCount: 0,
            assignmentsCount: 0,
          },
          siteAnalytics: {
            pageViews30d: 0,
            exports30d: 0,
            returningUsers30d: 0,
            topPages: [],
          },
          userEmailMap: {},
        }),
      ),
    ]);

    queue = q;
    hiddenPlans = h;
    overview = ov;
    extras = ext;

    if (fb.feedback.length > 0) {
      const names = await getUserNames(fb.feedback.map((f) => f.user_id)).catch(() => new Map());
      feedbackRows = fb.feedback.map((f) => ({
        id: String(f._id ?? ""),
        userId: f.user_id,
        userEmail: names.get(f.user_id)?.email ?? null,
        contactName: f.contact_name ?? null,
        contactInfo: f.contact_info ?? null,
        organization: f.organization ?? null,
        rating: f.rating,
        comment: f.comment,
        category: f.category,
        status: f.status,
        response: f.response,
        createdAt:
          f.created_at instanceof Date ? f.created_at.toISOString() : new Date().toISOString(),
      }));
    }
  } catch (error) {
    if (error instanceof AdminError && error.status === 401) redirect("/login?next=/admin");
    if (error instanceof AdminError && error.status === 403) notFound();
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-bold">Админ-панель</h1>
        <p role="alert" className="mt-4 text-sm text-muted-foreground">
          {error instanceof AdminError
            ? error.message
            : "Данные временно недоступны. Попробуйте позже."}
        </p>
        <Link href="/admin" prefetch={false} className="mt-4 inline-block underline">
          Повторить
        </Link>
      </main>
    );
  }

  return (
    <AdminShell
      initialTab={initialTab}
      data={data}
      overview={overview}
      feedbackRows={feedbackRows}
      queue={queue}
      hiddenPlans={hiddenPlans}
      extras={extras}
    />
  );
}
