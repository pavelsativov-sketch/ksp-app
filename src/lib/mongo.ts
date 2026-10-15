import { MongoClient, ObjectId, type Db } from "mongodb";
import { mongoRequestState } from "@/lib/mongo-request-context";

const URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || "ksp";

export function isMongoConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI || URI);
}

declare global {
  var __mongoClientPromise: Promise<MongoClient> | undefined;
  var __mongoIndexesPromise: Promise<void> | undefined;
}

async function currentMongoRequestState() {
  const contextual = mongoRequestState();
  if (contextual) return contextual;
  // Раньше здесь был fallback на Cloudflare context из OpenNext-воркера;
  // деплой Next.js на Cloudflare удалён, состояние передаётся только
  // через AsyncLocalStorage внутри одного процесса Next.js.
  return undefined;
}

export async function getClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI || URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");
  const requestState = await currentMongoRequestState();
  const cachedPromise = requestState ? requestState.clientPromise : global.__mongoClientPromise;
  if (!cachedPromise) {
    if (!requestState && process.env.OPEN_NEXT_ORIGIN) {
      throw new Error("Linux-sandbox Mongo request context is missing; refusing to reuse a global TCP client");
    }
    // Atlas из Казахстана отвечает медленно: 8 с роняло запросы с 500
    // «Server selection timed out». 20 с — с запасом на холодный старт.
    // Таймауты соединения и сокета.
    //
    // Раньше задавался только serverSelectionTimeoutMS. Дефолт
    // socketTimeoutMS в драйвере равен 0, то есть «бесконечно»: запрос к
    // зависшему сокету удерживал HTTP-соединение до глобального таймаута
    // платформы. На serverless при всплеске исчерпывался и пул (maxPoolSize
    // по умолчанию 100 при большем числе воркеров).
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 20_000,
      connectTimeoutMS: 10_000,
      socketTimeoutMS: 20_000,
      // Workers TCP sockets belong to a single request, so keep its pool small.
      maxPoolSize: requestState ? 2 : 10,
      maxConnecting: requestState ? 1 : 2,
      retryWrites: true,
    });
    const clientPromise = client.connect().then((connectedClient) => {
      return connectedClient;
    }).catch((error) => {
      if (requestState) requestState.clientPromise = undefined;
      else global.__mongoClientPromise = undefined;
      throw error;
    });
    if (requestState) requestState.clientPromise = clientPromise;
    else global.__mongoClientPromise = clientPromise;
  }
  return requestState ? requestState.clientPromise! : global.__mongoClientPromise!;
}

export const COL = {
  users: "users", subjects: "subjects", objectives: "learning_objectives",
  plans: "lesson_plans", planLikes: "lesson_plan_likes", textbooks: "textbooks",
  textbookChunks: "textbook_chunks", quizRooms: "quiz_rooms", quizEvents: "quiz_events",
  rateLimits: "rate_limits", passwordResets: "password_resets", aiEvents: "ai_events",
  billingCodes: "billing_codes", planEvents: "plan_events", planVersions: "lesson_plan_versions",
  planReports: "plan_reports",
  assignments: "assignments", assignmentAttempts: "assignment_attempts",
  // Учебная нагрузка учителя: «5-А», «7-Б», кружок, секция.
  classes: "teacher_classes",
  // Сохранённые комплекты материалов к уроку.
  kits: "lesson_kits",
  // Пользовательские шаблоны КСП.
  templates: "ksp_templates",
  // Комментарии к планам.
  comments: "comments",
  // Отзывы коллег о планах.
  planReviews: "plan_reviews",
  // Долгосрочные (ДСП) и среднесрочные (ССП) планы.
  longtermPlans: "longterm_plans",
  mediumtermPlans: "mediumterm_plans",
  // События аналитики (просмотры страниц, действия, ошибки).
  analyticsEvents: "analytics_events",
  // Отзывы пользователей.
  feedback: "feedback",
  // School Management
  schools: "schools",
  schoolMembers: "school_members",
  schoolClassAssignments: "school_class_assignments",
  schoolAuditEvents: "school_audit_events",
  schoolPlanApprovals: "school_plan_approval_cycles",
  notifications: "app_notifications",
  students: "students",
  attendance: "attendance",
  schoolGrades: "school_grades",
  curriculum: "curriculum",
  curriculumLessons: "curriculum_lessons",
  vskInspections: "vsk_inspections",
  vskChecklists: "vsk_checklists",
  agentTasks: "agent_tasks",
  agentExecutions: "agent_executions",
  agentBrowserSessions: "agent_browser_sessions",
  agentPermissionRequests: "agent_permission_requests",
  agentPolicies: "agent_policies",
  agentControls: "agent_controls",
  workspaceFiles: "workspace_files",
  workspaceSnapshots: "workspace_snapshots",
  connectors: "connectors",
  auditLog: "audit_log",
} as const;

async function ensureIndexes(db: Db): Promise<PromiseSettledResult<unknown>[]> {
  return Promise.allSettled([
    db.collection(COL.users).createIndex({ email: 1 }, { unique: true, name: "users_email_unique" }),
    db.collection(COL.plans).createIndex({ owner_id: 1, updated_at: -1 }, { name: "plans_owner_updated" }),
    db.collection(COL.plans).createIndex({ visibility: 1, updated_at: -1 }, { name: "plans_visibility_updated" }),
    // Сортировка библиотеки — по created_at (library-repo.ts), поэтому индекс
    // должен заканчиваться на created_at: иначе COLLSCAN + сортировка в памяти
    // на самом горячем публичном запросе.
    // Имя отдельное: в базе уже лежит plans_library_filters с updated_at,
    // и одноимённый createIndex падал, а не обновлял.
    db.collection(COL.plans).createIndex({ visibility: 1, subject_id: 1, grade: 1, quarter: 1, created_at: -1, _id: -1 }, { name: "plans_library_filters_created" }),
    // Главная страница библиотеки часто открывается БЕЗ фильтров по
    // предмету/классу/четверти. Составной индекс с этими полями применим
    // только когда ВСЕ они заданы равенством, поэтому запрос без фильтров
    // уходил в blocking SORT по всей коллекции. Отдельные индексы покрывают
    // «новые», «популярные» и «по названию».
    db.collection(COL.plans).createIndex({ visibility: 1, created_at: -1, _id: -1 }, { name: "plans_visibility_created" }),
    // Популярность теперь сортируется по материализованному likes_count,
    // поэтому сортировка покрывается индексом, а не вычисляется на лету.
    db.collection(COL.plans).createIndex({ visibility: 1, likes_count: -1, created_at: -1, _id: -1 }, { name: "plans_visibility_popularity" }),
    db.collection(COL.plans).createIndex({ visibility: 1, title: 1, _id: 1 }, { name: "plans_visibility_title" }),
    // library-query фильтрует по языку — без него в составном индексе
    // запрос ?language=kz отсекался по префиксу.
    db.collection(COL.plans).createIndex({ visibility: 1, language: 1, created_at: -1, _id: -1 }, { name: "plans_visibility_language_created" }),
    db.collection(COL.subjects).createIndex({ name_ru: 1 }, { name: "subjects_name_ru" }),
    db.collection(COL.planVersions).createIndex({ plan_id: 1, owner_id: 1, created_at: -1 }, { name: "plan_versions_owner_created" }),
    db.collection(COL.objectives).createIndex({ subject_id: 1, grade: 1, code: 1 }, { name: "objectives_subject_grade_code" }),
    db.collection(COL.objectives).createIndex({ text_ru: "text" }, { name: "objectives_text_search" }),
    db.collection(COL.textbooks).createIndex({ owner_id: 1, updated_at: -1 }, { name: "textbooks_owner_updated" }),
    db.collection(COL.textbookChunks).createIndex({ textbook_id: 1, chunk_index: 1 }, { unique: true, name: "chunks_textbook_index_unique" }),
    db.collection(COL.quizRooms).createIndex({ code: 1 }, { unique: true, name: "quiz_rooms_code_unique" }),
    db.collection(COL.quizRooms).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "quiz_rooms_ttl" }),
    db.collection(COL.quizEvents).createIndex({ roomCode: 1, seq: 1 }, { name: "quiz_events_room_seq" }),
    db.collection(COL.quizEvents).createIndex({ createdAt: 1 }, { expireAfterSeconds: 6 * 3600, name: "quiz_events_ttl" }),
    db.collection(COL.rateLimits).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "rate_limits_ttl" }),
    db.collection(COL.passwordResets).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "password_resets_ttl" }),
    db.collection(COL.passwordResets).createIndex({ tokenHash: 1 }, { name: "password_resets_token" }),
    db.collection(COL.planLikes).createIndex({ plan_id: 1, user_id: 1 }, { unique: true, name: "plan_likes_unique" }),
    db.collection(COL.aiEvents).createIndex({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600, name: "ai_events_ttl" }),
    db.collection(COL.aiEvents).createIndex({ task: 1, createdAt: -1 }, { name: "ai_events_task" }),
    db.collection(COL.aiEvents).createIndex({ user_id: 1, task: 1, createdAt: 1 }, { name: "ai_events_user_task_created" }),
    // Квота тарифа: один слот {user_id, task, month, seq} — уникальность только для документов с seq.
    db.collection(COL.aiEvents).createIndex(
      { user_id: 1, task: 1, month: 1, seq: 1 },
      { unique: true, name: "ai_events_quota_slot_unique", partialFilterExpression: { seq: { $type: "number" } } },
    ),
    // Биллинг: уникальный хеш кода активации + аудит изменений плана.
    db.collection(COL.billingCodes).createIndex({ codeHash: 1 }, { unique: true, name: "billing_codes_codehash_unique" }),
    db.collection(COL.billingCodes).createIndex({ status: 1 }, { name: "billing_codes_status" }),
    db.collection(COL.planEvents).createIndex({ user_id: 1, created_at: -1 }, { name: "plan_events_user_created" }),
    // Модерация библиотеки: жалобы на планы и скрытие.
    db.collection(COL.planReports).createIndex({ plan_id: 1, created_at: -1 }, { name: "plan_reports_plan_created" }),
    db.collection(COL.planReports).createIndex({ status: 1, created_at: -1 }, { name: "plan_reports_status_created" }),
    db.collection(COL.plans).createIndex({ moderation_hidden: 1 }, { name: "plans_moderation_hidden", partialFilterExpression: { moderation_hidden: true } }),
    // Выдачи ученикам: код комнаты + попытки.
    db.collection(COL.assignments).createIndex({ code: 1 }, { unique: true, name: "assignments_code_unique" }),
    db.collection(COL.assignments).createIndex({ owner_id: 1, created_at: -1 }, { name: "assignments_owner_created" }),
    // Истёкшие выдачи (и попытки с ФИО несовершеннолетних) жили в базе
    // вечно: поля expires_at есть, а TTL-индекса не было.
    db.collection(COL.assignments).createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: "assignments_ttl" }),
    db.collection(COL.assignmentAttempts).createIndex({ assignment_id: 1, score: -1 }, { name: "attempts_assignment_score" }),
    db.collection(COL.assignmentAttempts).createIndex({ assignment_id: 1, student_name: 1 }, { name: "attempts_assignment_student" }),
    // Один документ на ученика на выдачу. Без уникальности две
    // параллельные отправки создавали два документа, и журнал учителя
    // показывал ученика дважды, а attempts_count расходился с числом строк.
    db.collection(COL.assignmentAttempts).createIndex(
      { assignment_id: 1, student_name: 1 },
      { unique: true, name: "attempts_assignment_student_unique" },
    ),
    // Удаление аккаунта и выгрузка данных идут по владельцу выдачи.
    db.collection(COL.assignmentAttempts).createIndex({ owner_id: 1 }, { name: "attempts_owner" }),
    db.collection(COL.schoolClassAssignments).createIndex(
      { school_id: 1, teacher_id: 1, class_name: 1 },
      { unique: true, name: "school_class_assignment_unique" },
    ),
    db.collection(COL.schoolClassAssignments).createIndex({ school_id: 1, teacher_id: 1, active: 1 }, { name: "school_class_assignment_teacher_active" }),
    db.collection(COL.schoolClassAssignments).createIndex({ school_id: 1, class_name: 1, active: 1 }, { name: "school_class_assignment_class_active" }),
    db.collection(COL.schoolAuditEvents).createIndex({ school_id: 1, created_at: -1 }, { name: "school_audit_school_created" }),
    db.collection(COL.schoolPlanApprovals).createIndex({ school_id: 1, plan_id: 1, cycle: 1 }, { unique: true, name: "school_plan_approval_cycle_unique" }),
    db.collection(COL.schoolPlanApprovals).createIndex({ school_id: 1, status: 1, submitted_at: 1 }, { name: "school_plan_approval_queue" }),
    db.collection(COL.schoolPlanApprovals).createIndex({ school_id: 1, status: 1, "snapshot.school_class_name": 1, submitted_at: 1 }, { name: "school_plan_approval_queue_by_class" }),
    db.collection(COL.schoolPlanApprovals).createIndex({ school_id: 1, owner_id: 1, plan_id: 1, cycle: -1 }, { name: "school_plan_approval_owner_history" }),
    db.collection(COL.notifications).createIndex({ user_id: 1, dedupe_key: 1 }, { unique: true, name: "notifications_user_dedupe_unique" }),
    db.collection(COL.notifications).createIndex({ user_id: 1, created_at: -1 }, { name: "notifications_user_created" }),
    db.collection(COL.notifications).createIndex({ created_at: 1 }, { expireAfterSeconds: 180 * 24 * 3600, name: "notifications_ttl" }),
    db.collection(COL.schoolMembers).createIndex({ school_id: 1, user_id: 1 }, { unique: true, name: "school_members_unique" }),
    db.collection(COL.schoolMembers).createIndex({ school_id: 1, role: 1 }, { name: "school_members_role" }),
    // Классы учителя: уникальность названия в пределах владельца,
    // чтобы «5-А» нельзя было завести дважды.
    db.collection(COL.classes).createIndex({ owner_id: 1, name: 1 }, { unique: true, name: "classes_owner_name_unique" }),
    // Планы фильтруются по классу в дашборде и библиотеке.
    db.collection(COL.plans).createIndex({ owner_id: 1, class_id: 1, updated_at: -1 }, { name: "plans_owner_class" }),
    db.collection(COL.kits).createIndex({ owner_id: 1, class_id: 1, updated_at: -1 }, { name: "kits_owner_class" }),
    // listKits фильтрует только по owner_id и сортирует по updated_at.
    // class_id в середине префикса делает сортировку незакрытой — Mongo
    // вынуждена была сортировать в памяти весь набор комплектов.
    db.collection(COL.kits).createIndex({ owner_id: 1, updated_at: -1 }, { name: "kits_owner_updated" }),
    db.collection(COL.templates).createIndex({ owner_id: 1, updated_at: -1 }, { name: "templates_owner_updated" }),
    // Комментарии и отзывы к планам.
    db.collection(COL.comments).createIndex({ plan_id: 1, created_at: 1 }, { name: "comments_plan_created" }),
    db.collection(COL.planReviews).createIndex({ plan_id: 1, created_at: -1 }, { name: "plan_reviews_plan_created" }),
    // ДСП и ССП: фильтрация по владельцу и сортировка по обновлению.
    db.collection(COL.longtermPlans).createIndex({ owner_id: 1, updated_at: -1 }, { name: "longterm_plans_owner_updated" }),
    db.collection(COL.mediumtermPlans).createIndex({ owner_id: 1, updated_at: -1 }, { name: "mediumterm_plans_owner_updated" }),
    db.collection(COL.mediumtermPlans).createIndex({ longTermId: 1, quarter: 1 }, { name: "mediumterm_plans_longterm_quarter" }),
    // Реальный фильтр getMediumTermPlans — { owner_id, longTermId?, quarter? }
    // плюс сортировка по updated_at. Ни один индекс не покрывал связку, поэтому
    // запрос был COLLSCAN-фильтром плюс сортировка в памяти.
    db.collection(COL.mediumtermPlans).createIndex({ owner_id: 1, longTermId: 1, quarter: 1, updated_at: -1 }, { name: "mediumterm_plans_owner_longterm_quarter" }),
    // Аналитика: агрегации по пользователю, событию и времени.
    db.collection(COL.analyticsEvents).createIndex({ user_id: 1, timestamp: -1 }, { name: "analytics_user_timestamp" }),
    db.collection(COL.analyticsEvents).createIndex({ event: 1, timestamp: -1 }, { name: "analytics_event_timestamp" }),
    db.collection(COL.analyticsEvents).createIndex({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 3600, name: "analytics_events_ttl" }),
    // Отзывы: фильтрация по пользователю и статусу.
    db.collection(COL.feedback).createIndex({ user_id: 1, created_at: -1 }, { name: "feedback_user_created" }),
    db.collection(COL.feedback).createIndex({ status: 1, created_at: -1 }, { name: "feedback_status_created" }),
    // School Management
    db.collection(COL.schools).createIndex({ code: 1 }, { unique: true, name: "schools_code_unique" }),
    db.collection(COL.schools).createIndex({ name: 1 }, { name: "schools_name" }),
    db.collection(COL.schoolMembers).createIndex({ school_id: 1, user_id: 1 }, { unique: true, name: "school_members_unique" }),
    db.collection(COL.schoolMembers).createIndex({ school_id: 1 }, { name: "school_members_school" }),
    db.collection(COL.schoolMembers).createIndex({ user_id: 1 }, { name: "school_members_user" }),
    db.collection(COL.students).createIndex({ school_id: 1, class_name: 1 }, { name: "students_school_class" }),
    db.collection(COL.students).createIndex({ school_id: 1 }, { name: "students_school" }),
    db.collection(COL.attendance).createIndex({ school_id: 1, date: 1 }, { name: "attendance_school_date" }),
    // Аналитика по классам фильтрует {school_id, class_name, date} — без
    // class_id в индексе весь диапазон дат школы сканировался целиком.
    db.collection(COL.attendance).createIndex({ school_id: 1, class_name: 1, date: 1 }, { name: "attendance_school_class_date" }),
    db.collection(COL.attendance).createIndex({ student_id: 1, date: 1 }, { name: "attendance_student_date" }),
    db.collection(COL.schoolGrades).createIndex({ school_id: 1, student_id: 1 }, { name: "school_grades_school_student" }),
    db.collection(COL.schoolGrades).createIndex({ school_id: 1, subject: 1, quarter: 1 }, { name: "school_grades_school_subject_quarter" }),
    db.collection(COL.curriculum).createIndex({ school_id: 1, teacher_id: 1 }, { name: "curriculum_school_teacher" }),
    db.collection(COL.vskInspections).createIndex({ school_id: 1, date: 1 }, { name: "vsk_inspections_school_date" }),
    db.collection(COL.vskInspections).createIndex({ school_id: 1 }, { name: "vsk_inspections_school" }),
    db.collection(COL.agentTasks).createIndex({ user_id: 1, created_at: -1 }, { name: "agent_tasks_user_created" }),
    db.collection(COL.agentTasks).createIndex({ school_id: 1, status: 1 }, { name: "agent_tasks_school_status" }),
    db.collection(COL.agentExecutions).createIndex({ task_id: 1, created_at: -1 }, { name: "agent_executions_task_created" }),
    db.collection(COL.agentBrowserSessions).createIndex({ user_id: 1 }, { unique: true, name: "agent_browser_sessions_user_unique" }),
    db.collection(COL.agentPermissionRequests).createIndex({ user_id: 1, status: 1, created_at: -1 }, { name: "agent_permissions_user_status_created" }),
    db.collection(COL.agentPermissionRequests).createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: "agent_permissions_expiry" }),
    db.collection(COL.agentPolicies).createIndex({ user_id: 1 }, { unique: true, name: "agent_policies_user_unique" }),
    db.collection(COL.agentControls).createIndex({ user_id: 1 }, { unique: true, name: "agent_controls_user_unique" }),
    db.collection(COL.workspaceFiles).createIndex({ user_id: 1, path: 1 }, { name: "workspace_files_user_path" }),
    db.collection(COL.workspaceFiles).createIndex({ user_id: 1, path: 1, name: 1 }, { unique: true, name: "workspace_files_user_path_name_unique" }),
    db.collection(COL.workspaceSnapshots).createIndex({ user_id: 1, created_at: -1 }, { name: "workspace_snapshots_user_created" }),
    db.collection(COL.connectors).createIndex({ school_id: 1, type: 1 }, { name: "connectors_school_type" }),
    db.collection(COL.auditLog).createIndex({ school_id: 1, created_at: -1 }, { name: "audit_log_school_created" }),
    db.collection(COL.auditLog).createIndex({ created_at: 1 }, { expireAfterSeconds: 180 * 24 * 3600, name: "audit_log_ttl" }),
  ]);
}

/**
 * Хвост индексации. Индексы нужны для производительности, но их отсутствие
 * не должно ронять приложение: раньше реджект из ensureIndexes пробрасывался
 * в getDb(), то есть падал каждый запрос, и промис сбрасывался по кругу.
 */
function swallowIndexErrors(errors: PromiseSettledResult<unknown>[]): void {
  for (const r of errors) {
    if (r.status === "rejected") {
      console.error(
        "[mongo] Не удалось создать индекс (запросы продолжат работать, но могут быть медленнее):",
        r.reason instanceof Error ? r.reason.message : r.reason,
      );
    }
  }
}

export async function getDb(): Promise<Db> {
  const client = await getClient();
  const db = client.db(DB_NAME);
  // Resolve the same OpenNext context as getClient: the request AsyncLocalStorage
  // instance may not cross the Worker/Next bundle boundary on Cloudflare.
  const requestScopedWorker = Boolean(await currentMongoRequestState());
  // Index DDL creates dozens of background operations and outlives the
  // request-scoped socket. Manage indexes once from Node/Vercel or explicitly
  // opt in during a controlled Worker migration.
  const shouldEnsureIndexes = !requestScopedWorker || process.env.MONGO_AUTO_INDEX === "true";
  if (shouldEnsureIndexes && !global.__mongoIndexesPromise) {
    // Не блокируем выдачу Db индексацией: на Workers у каждого изолята свой
    // global, и 30+ createIndex на холодный старт заметно добавляли латентности.
    global.__mongoIndexesPromise = ensureIndexes(db)
      .then(swallowIndexErrors)
      .catch((error) => {
        global.__mongoIndexesPromise = undefined;
        console.error("[mongo] Инициализация индексов не удалась:", error instanceof Error ? error.message : error);
      });
  }
  if (shouldEnsureIndexes && global.__mongoIndexesPromise) void global.__mongoIndexesPromise;
  return db;
}

export function toObjectId(id: string): ObjectId | null {
  return /^[0-9a-f]{24}$/i.test(id) ? new ObjectId(id) : null;
}

/**
 * Безопасный доступ к базе для страниц.
 *
 * Раньше страницы проверяли только `isMongoConfigured()` (то есть наличие
 * переменной окружения) и затем вызывали getDb() без try/catch. Если Mongo
 * была настроена, но упала, пользователь видел «Что-то пошло не так» вместо
 * понятного «нет связи с базой, попробуйте позже».
 */
export type DbResult<T> = { ok: true; data: T } | { ok: false; reason: "unavailable" };

export async function tryDb<T>(fn: (db: Db) => Promise<T>): Promise<DbResult<T>> {
  try {
    return { ok: true, data: await fn(await getDb()) };
  } catch (error) {
    // Логируем, но не пробрасываем: страница покажет заглушку.
    const { log } = await import("@/lib/logger");
    log.error("MongoDB недоступна", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, reason: "unavailable" };
  }
}
