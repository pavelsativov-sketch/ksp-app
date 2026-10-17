"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { log } from "@/lib/logger";
import { randomBytes, createHash } from "node:crypto";
import { MongoServerError, ObjectId } from "mongodb";
import { getDb, COL } from "@/lib/mongo";
import { createSession, clearSession, findUserByEmail, hashPassword, verifyPassword } from "@/lib/auth";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/mailer";

const passwordSchema = z.string().min(10, "Пароль должен содержать минимум 10 символов").max(128);
const loginSchema = z.object({ email: z.email({ error: "Некорректный email" }), password: passwordSchema });
const registerSchema = loginSchema.extend({ fullName: z.string().trim().min(2, "Укажите имя").max(200) });

export type AuthFormState = { error?: string; fieldErrors?: Record<string, string>; info?: string };

function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(error.issues.map((issue) => [issue.path.join("."), issue.message]));
}

/** IP вызывающего — для лимитов, не зависящих от email. */
async function authClientIp(): Promise<string> {
  // Раньше здесь была отдельная копия разбора заголовков. Расхождение с
  // rate-limit.ts приводило к тому, что часть лимитов доверяла
  // x-forwarded-for напрямую (его подделывает клиент), а часть — нет, и
  // лимит логина обходился ротацией заголовка.
  const [{ clientIpFromHeaders }, { headers }] = await Promise.all([
    import("@/lib/rate-limit"),
    import("next/headers"),
  ]);
  return clientIpFromHeaders(await headers());
}

/**
 * Безопасный внутренний путь для редиректа после входа.
 *
 Прежняя проверка `/^\/(?!\/)/` пропускала `/\evil.com` и `/%09/evil.com`:
 браузер нормализует `\` и управляющие символы в `/`, получая `//evil.com`,
 то есть учителя после входа уводило на внешний домен (фишинг).
 */
function safeNextPath(raw: FormDataEntryValue | null): string {
  if (typeof raw !== "string") return "/dashboard";
  const value = raw.trim();
  if (!value.startsWith("/")) return "/dashboard";
  // Обратный слеш и управляющие символы — признаки попытки выйти за пределы
  // текущего сайта после нормализации браузером.
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return "/dashboard";
  if (value.startsWith("//")) return "/dashboard";
  // /%2F%2Fevil.com и подобные — декодируем один раз и проверяем снова.
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return "/dashboard";
  }
  if (decoded.startsWith("//") || decoded.includes("\\") || !decoded.startsWith("/")) return "/dashboard";
  return value;
}

export async function loginAction(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  // Лимит по email обнуляется на каждом новом адресе, поэтому нужен ещё и
  // лимит по IP: иначе credential stuffing по списку адресов не ограничен.
  const ip = await authClientIp();
  const [byEmail, byIp] = await Promise.all([
    checkRateLimitAsync(`auth:login:${parsed.data.email.toLowerCase()}`, 10, 15 * 60_000),
    checkRateLimitAsync(`auth:login:ip:${ip}`, 30, 15 * 60_000),
  ]);
  if (!byEmail.ok || !byIp.ok) return { error: "Слишком много попыток. Попробуйте через несколько минут." };
  // Возврат на страницу, с которой пользователя отправили логиниться
  // (hidden input next из /login?next=...): только внутренние пути.
  const next = safeNextPath(formData.get("next"));
  try {
    const user = await findUserByEmail(parsed.data.email);
    if (!user || !(await verifyPassword(parsed.data.password, user.password_hash))) return { error: "Неверный email или пароль" };
    await createSession(user._id.toString(), user.session_version ?? 0, {
      email: user.email,
      fullName: user.full_name,
    });
  } catch (error) {
    log.error("loginAction failed", { error: error instanceof Error ? error.message : String(error) });
    return { error: "Не удалось войти. Повторите попытку позже." };
  }
  revalidatePath("/", "layout");
  redirect(next);
}

export async function registerAction(_: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({ email: formData.get("email"), password: formData.get("password"), fullName: formData.get("fullName") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  // Массовая регистрация ограничивается по IP, а не только по email.
  const ip = await authClientIp();
  const [byEmail, byIp] = await Promise.all([
    checkRateLimitAsync(`auth:register:${parsed.data.email.toLowerCase()}`, 5, 60 * 60_000),
    checkRateLimitAsync(`auth:register:ip:${ip}`, 10, 60 * 60_000),
  ]);
  if (!byEmail.ok || !byIp.ok) return { error: "Слишком много попыток регистрации. Попробуйте позже." };
  try {
    const db = await getDb();
    const result = await db.collection(COL.users).insertOne({
      email: parsed.data.email.toLowerCase(), password_hash: await hashPassword(parsed.data.password),
      full_name: parsed.data.fullName, created_at: new Date(), session_version: 0,
    });
    await createSession(result.insertedId.toString(), 0, {
      email: parsed.data.email.toLowerCase(),
      fullName: parsed.data.fullName,
    });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) return { error: "Пользователь с таким email уже зарегистрирован" };
    log.error("registerAction failed", { error: error instanceof Error ? error.message : String(error) });
    return { error: "Не удалось зарегистрироваться. Повторите попытку позже." };
  }
  revalidatePath("/", "layout");
  redirect("/welcome");
}

export async function logoutAction() {
  await clearSession();
  revalidatePath("/", "layout");
  redirect("/");
}

// ── Управление аккаунтом (профиль) ───────────────────────────────────

const profileSchema = z.object({ fullName: z.string().trim().min(2, "Укажите имя").max(200) });

export async function updateProfileAction(
  _: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const { getCurrentUser } = await import("@/lib/auth");
  const user = await getCurrentUser();
  if (!user) return { error: "Требуется вход" };
  const parsed = profileSchema.safeParse({ fullName: formData.get("fullName") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  try {
    const db = await getDb();
    await db.collection(COL.users).updateOne(
      { _id: new ObjectId(user.id) },
      { $set: { full_name: parsed.data.fullName } },
    );
  } catch (error) {
    log.error("updateProfileAction failed", { error: error instanceof Error ? error.message : String(error) });
    return { error: "Не удалось сохранить. Попробуйте позже." };
  }
  revalidatePath("/profile");
  revalidatePath("/", "layout");
  return { info: "Имя обновлено." };
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Введите текущий пароль"),
  password: passwordSchema,
});

export async function changePasswordAction(
  _: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const { getCurrentUser } = await import("@/lib/auth");
  const user = await getCurrentUser();
  if (!user) return { error: "Требуется вход" };
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  const rateLimit = await checkRateLimitAsync(`auth:change-pw:${user.id}`, 5, 60 * 60_000);
  if (!rateLimit.ok) return { error: "Слишком много попыток. Попробуйте позже." };
  try {
    const db = await getDb();
    const doc = await db.collection(COL.users).findOne({ _id: new ObjectId(user.id) });
    if (!doc || !(await verifyPassword(parsed.data.currentPassword, doc.password_hash))) {
      return { error: "Текущий пароль неверный" };
    }
    await db.collection(COL.users).updateOne(
      { _id: new ObjectId(user.id) },
      { $set: { password_hash: await hashPassword(parsed.data.password) }, $inc: { session_version: 1 } },
    );
    // Все сессии, включая текущую, инвалидируются — входим заново.
    await createSession(user.id, (doc.session_version ?? 0) + 1, {
      email: user.email,
      fullName: user.fullName,
    });
  } catch (error) {
    log.error("changePasswordAction failed", { error: error instanceof Error ? error.message : String(error) });
    return { error: "Не удалось сменить пароль. Попробуйте позже." };
  }
  revalidatePath("/profile");
  return { info: "Пароль изменён." };
}

const deleteAccountSchema = z.object({
  password: z.string().min(1, "Введите пароль для подтверждения"),
  confirm: z.string().refine((v) => v.trim().toLowerCase() === "удалить", "Введите слово УДАЛИТЬ"),
});

/**
 * Удаление аккаунта: пользователь, планы, версии, лайки, учебники и чанки,
 * сбросы пароля, жалобы, домашние выдачи и результаты учеников.
 *
 * Выдачи и попытки обязательны: там лежит `student_name` — персональные данные
 * несовершеннолетних. Раньше они оставались в базе навсегда уже после удаления
 * аккаунта учителя. Аудит биллинга (plan_events) и учёт AI сохраняются
 * обезличенно — они нужны для статистики и безопасности.
 */
export async function deleteAccountAction(
  _: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const { getCurrentUser } = await import("@/lib/auth");
  const user = await getCurrentUser();
  if (!user) return { error: "Требуется вход" };
  const parsed = deleteAccountSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  const rateLimit = await checkRateLimitAsync(`auth:delete:${user.id}`, 3, 60 * 60_000);
  if (!rateLimit.ok) return { error: "Слишком много попыток. Попробуйте позже." };
  try {
    const db = await getDb();
    const oid = new ObjectId(user.id);
    const doc = await db.collection(COL.users).findOne({ _id: oid });
    if (!doc || !(await verifyPassword(parsed.data.password, doc.password_hash))) {
      return { error: "Пароль неверный" };
    }
    const textbooks = await db.collection(COL.textbooks).find({ owner_id: user.id }, { projection: { _id: 1 } }).toArray();
    const textbookIds = textbooks.map((t) => t._id.toString());
    const assignments = await db
      .collection(COL.assignments)
      .find({ owner_id: user.id }, { projection: { _id: 1 } })
      .toArray();
    const assignmentIds = assignments.map((a) => a._id.toString());
    // id планов нужны после их удаления внутри транзакции — собираем заранее.
    const plans = await db
      .collection(COL.plans)
      .find({ owner_id: user.id }, { projection: { _id: 1 } })
      .toArray();
    const planIds = plans.map((p) => p._id.toString());
    // id задач агента нужны, чтобы удалить их логи (agent_executions хранит
    // только task_id, поля user_id в нём нет).
    const agentTaskIds = (
      await db
        .collection(COL.agentTasks)
        .find({ user_id: user.id }, { projection: { _id: 1 } })
        .toArray()
    ).map((t) => t._id);
    // Одна транзакция: частичный сбой не должен оставлять сирот (планы без
    // пользователя, выдачи без попыток). Операции в сессии — строго
    // последовательно: MongoDB не допускает параллельных операций в сессии.
    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        await db.collection(COL.plans).deleteMany({ owner_id: user.id }, { session });
        await db.collection(COL.planVersions).deleteMany({ owner_id: user.id }, { session });
        await db.collection(COL.planLikes).deleteMany({ user_id: user.id }, { session });
        if (textbookIds.length) {
          await db.collection(COL.textbookChunks).deleteMany({ textbook_id: { $in: textbookIds } }, { session });
        }
        await db.collection(COL.textbooks).deleteMany({ owner_id: user.id }, { session });
        await db.collection(COL.passwordResets).deleteMany({ userId: user.id }, { session });
        await db.collection(COL.planReports).deleteMany({ reporter_id: user.id }, { session });
        // Попытки удаляем ДО выдач: в них имена учеников и все их ответы.
        if (assignmentIds.length) {
          await db.collection(COL.assignmentAttempts).deleteMany({ assignment_id: { $in: assignmentIds } }, { session });
        }
        await db.collection(COL.assignments).deleteMany({ owner_id: user.id }, { session });

        // Дальше идут коллекции, которые тоже хранят персональные данные
        // учителя, но раньше не удалялись: комплекты материалов, шаблоны КСП,
        // классы, комментарии и оценки (в них — имена коллег), годовое
        // планирование, ССП, рабочая область агента, файлы подключённых
        // сервисов, задачи агента и события биллинга. После «удаления
        // аккаунта» они оставались в базе — это расхождение с тем, что
        // обещает экран удаления.
        await db.collection(COL.kits).deleteMany({ owner_id: user.id }, { session });
        await db.collection(COL.templates).deleteMany({ owner_id: user.id }, { session });
        await db.collection(COL.classes).deleteMany({ owner_id: user.id }, { session });
        await db.collection(COL.longtermPlans).deleteMany({ owner_id: user.id }, { session });
        await db.collection(COL.mediumtermPlans).deleteMany({ owner_id: user.id }, { session });
        await db.collection(COL.feedback).deleteMany({ user_id: user.id }, { session });
        await db.collection(COL.workspaceFiles).deleteMany({ user_id: user.id }, { session });
        await db.collection(COL.workspaceSnapshots).deleteMany({ user_id: user.id }, { session });
        await db.collection(COL.connectors).deleteMany({ owner_id: user.id }, { session });
        // Логи агента привязаны к задаче, а не к пользователю: собираем task_id
        // заранее (внутри транзакции читать без сессии нельзя), иначе
        // deleteMany по несуществующему user_id удалял 0 документов, а
        // промпты учителя оставались в базе.
        if (agentTaskIds.length) {
          await db.collection(COL.agentExecutions).deleteMany({ task_id: { $in: agentTaskIds } }, { session });
        }
        await db.collection(COL.agentTasks).deleteMany({ user_id: user.id }, { session });
        await db.collection(COL.agentBrowserSessions).deleteMany({ user_id: user.id }, { session });
        await db.collection(COL.agentPermissionRequests).deleteMany({ user_id: user.id }, { session });
        await db.collection(COL.agentPolicies).deleteMany({ user_id: user.id }, { session });
        await db.collection(COL.agentControls).deleteMany({ user_id: user.id }, { session });
        await db.collection(COL.planEvents).deleteMany({ user_id: user.id }, { session });
        await db.collection(COL.aiEvents).deleteMany({ user_id: user.id }, { session });

        // Комментарии и отзывы: удаляем только записи самого учителя,
        // сохраняя чужие на его планах — иначе исчезла бы переписка коллег.
        // В отзывах поле называется `reviewer_id`, а не `user_id`:
        // deleteMany по несуществующему полю молча удалял 0 документов.
        await db.collection(COL.comments).deleteMany({ user_id: user.id }, { session });
        await db.collection(COL.planReviews).deleteMany({ reviewer_id: user.id }, { session });

        // Посещаемость удаляем по `recorded_by` — это единственное поле,
        // связывающее запись с учителем. Учеников школы НЕ трогаем:
        // в StudentDoc полей owner_id/created_by нет, такие записи являются
        // данными школы, а не учителя, и удаление одного учителя не должно
        // стирать карточки всего класса.
        await db.collection(COL.attendance).deleteMany({ recorded_by: user.id }, { session });
        await db.collection(COL.schoolMembers).deleteMany({ user_id: user.id }, { session });

        // Комнаты live-квизов, которые учитель вёл, и события аналитики,
        // привязанные к его планам (темы, предметы — персональные данные).
        await db.collection(COL.quizRooms).deleteMany({ ownerId: user.id }, { session });
        if (planIds.length) {
          await db.collection(COL.analyticsEvents).deleteMany({ planId: { $in: planIds } }, { session });
        }

        // Учеников школы намеренно НЕ удаляем: в StudentDoc полей owner_id
        // нет, такие записи — собственность школы, а не учителя.

        await db.collection(COL.users).deleteOne({ _id: oid }, { session });
      });
    } finally {
      await session.endSession();
    }
    await import("@/lib/workspace/runtime")
      .then(({ deleteAccountWorkspaceSandbox }) => deleteAccountWorkspaceSandbox(user.id))
      .catch(() => log.warn("Не удалось удалить Linux-среду удалённого аккаунта", { userId: user.id }));
    await import("@/lib/agents/browser-session").then(({ clearAgentBrowserSession }) => clearAgentBrowserSession(user.id)).catch(() => {});
    await clearSession();
  } catch (error) {
    log.error("deleteAccountAction failed", { error: error instanceof Error ? error.message : String(error) });
    return { error: "Не удалось удалить аккаунт. Попробуйте позже." };
  }
  revalidatePath("/", "layout");
  redirect("/?deleted=1");
}

// ── Восстановление пароля ──────────────────────────────────────────────

const RESET_TTL_MS = 60 * 60_000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const requestResetSchema = z.object({ email: z.email({ error: "Некорректный email" }) });

/**
 * Запрос сброса пароля. Всегда отвечает одинаково (не раскрываем наличие
 * аккаунта). Токен одноразовый, живёт 1 час, хранится хэшированным.
 *
 * Ссылка доставляется только по почте; сбой доставки не раскрывает токен.
 */
export async function requestPasswordResetAction(
  _: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = requestResetSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };
  const email = parsed.data.email.toLowerCase();

  const rateLimit = await checkRateLimitAsync(`auth:reset:${email}`, 3, 60 * 60_000);
  if (!rateLimit.ok) return { error: "Слишком много запросов. Попробуйте через час." };

  try {
    const user = await findUserByEmail(email);
    if (user) {
      const base = process.env.APP_URL;
      if (!base || !process.env.RESEND_API_KEY) {
        return { info: "Если такой email зарегистрирован, письмо со ссылкой отправлено." };
      }
      const resetUrl = new URL("/reset-password", base);
      if (resetUrl.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && resetUrl.protocol === "http:")) {
        throw new Error("APP_URL must use HTTPS in production");
      }
      const token = randomBytes(32).toString("hex");
      const db = await getDb();
      await db.collection(COL.passwordResets).insertOne({
        userId: user._id.toString(),
        sessionVersion: user.session_version ?? 0,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
        createdAt: new Date(),
      });
      resetUrl.searchParams.set("token", token);
      const link = resetUrl.toString();
      const sent = await sendEmail(
        email,
        "Сброс пароля — Mekty",
        `<p>Чтобы задать новый пароль, перейдите по ссылке (действует 1 час):</p><p><a href="${link}">${link}</a></p>`,
      );
      if (!sent) {
        await db.collection(COL.passwordResets).deleteOne({ tokenHash: hashToken(token) });
      }
    }
  } catch (error) {
    log.error("requestPasswordResetAction failed", { error: error instanceof Error ? error.message : String(error) });
    return { error: "Не удалось создать запрос. Повторите попытку позже." };
  }
  return { info: "Если такой email зарегистрирован, письмо со ссылкой отправлено." };
}

const confirmPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export async function resetPasswordAction(
  _: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = confirmPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) };

  const rateLimit = await checkRateLimitAsync(
    `auth:reset-confirm:${parsed.data.token.slice(0, 12)}`,
    10,
    60 * 60_000,
  );
  if (!rateLimit.ok) return { error: "Слишком много попыток. Попробуйте позже." };

  try {
    const db = await getDb();
    const doc = await db
      .collection(COL.passwordResets)
      .findOneAndDelete({ tokenHash: hashToken(parsed.data.token), expiresAt: { $gt: new Date() } });
    if (!doc) return { error: "Ссылка недействительна или истекла. Запросите новую." };

    const result = await db
      .collection(COL.users)
      .updateOne(
        {
          _id: new ObjectId(String(doc.userId)),
          $expr: { $eq: [{ $ifNull: ["$session_version", 0] }, doc.sessionVersion ?? 0] },
        },
        {
          $set: { password_hash: await hashPassword(parsed.data.password) },
          $inc: { session_version: 1 },
        },
      );
    if (result.matchedCount === 0) return { error: "Ссылка недействительна. Запросите новую." };

    await db.collection(COL.passwordResets).deleteMany({
      userId: String(doc.userId),
      $expr: { $lte: [{ $ifNull: ["$sessionVersion", 0] }, doc.sessionVersion ?? 0] },
    });
    await clearSession();
  } catch (error) {
    log.error("resetPasswordAction failed", { error: error instanceof Error ? error.message : String(error) });
    return { error: "Не удалось сбросить пароль. Повторите попытку позже." };
  }
  revalidatePath("/", "layout");
  redirect("/login?reset=1");
}
