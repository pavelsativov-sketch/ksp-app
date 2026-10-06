import "server-only";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { COL, getDb } from "@/lib/mongo";
import { hashActivationCode, type BillingCodeDocument } from "@/lib/billing/redeem";
import { AdminError, limitAdmin, requireAdmin } from "./auth";

export interface AdminCodeDocument extends BillingCodeDocument {
  created_by?: string;
  revoked_by?: string;
  revoked_at?: Date;
}

const createSchema = z.object({ type: z.enum(["pro_1m", "pro_3m", "pro_1y"]) }).strict();
const revokeSchema = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }).strict();
const bulkSchema = z.object({
  type: z.enum(["pro_1m", "pro_3m", "pro_1y"]),
  count: z.coerce.number().int().min(1).max(20),
}).strict();
const grantSchema = z.object({
  email: z.email({ error: "Некорректный email" }).transform((v) => v.toLowerCase()),
  type: z.enum(["pro_1m", "pro_3m", "pro_1y"]),
}).strict();

export async function createAdminCode(input: unknown) {
  const admin = await requireAdmin();
  await limitAdmin(admin.id, "create");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) throw new AdminError(400, "Выберите допустимый срок Pro.");
  // 256 random bits; only the action's successful response can disclose this value.
  const plaintext = `MEKTY-${randomBytes(32).toString("hex")}`;
  const id = new ObjectId();
  const now = new Date();
  const db = await getDb();
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection<AdminCodeDocument>(COL.billingCodes).insertOne({
        _id: id, codeHash: hashActivationCode(plaintext), type: parsed.data.type,
        status: "active", created_at: now, created_by: admin.id,
        redeemed_by: null, redeemed_at: null,
      }, { session });
      await db.collection(COL.planEvents).insertOne({
        event: "activation_code_created", user_id: admin.id, actor_id: admin.id,
        code_id: id, code_type: parsed.data.type, created_at: now,
      }, { session });
    });
  } finally {
    await session.endSession();
  }
  return { id: id.toHexString(), plaintext };
}

export async function revokeAdminCode(input: unknown) {
  const admin = await requireAdmin();
  await limitAdmin(admin.id, "revoke");
  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) throw new AdminError(400, "Некорректный идентификатор кода.");
  const db = await getDb();
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      const now = new Date();
      // CAS on active status races safely with redemption in its own transaction.
      const code = await db.collection<AdminCodeDocument>(COL.billingCodes).findOneAndUpdate(
        { _id: new ObjectId(parsed.data.id), status: "active" },
        { $set: { status: "revoked", revoked_by: admin.id, revoked_at: now } },
        { session, returnDocument: "after", projection: { _id: 1, type: 1 } },
      );
      if (!code) throw new AdminError(409, "Код уже использован, отозван или не существует.");
      await db.collection(COL.planEvents).insertOne({
        event: "activation_code_revoked", user_id: admin.id, actor_id: admin.id,
        code_id: code._id, code_type: code.type, created_at: now,
      }, { session });
    });
  } finally {
    await session.endSession();
  }
}

/**
 * Пакетное создание кодов (до 20 за раз — в пределах часового лимита).
 * Открытые тексты возвращаются один раз, в базе только хеши.
 */
export async function createAdminCodesBulk(input: unknown) {
  const admin = await requireAdmin();
  await limitAdmin(admin.id, "create");
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) throw new AdminError(400, "Выберите срок и количество от 1 до 20.");
  const out: Array<{ id: string; plaintext: string }> = [];
  for (let i = 0; i < parsed.data.count; i++) {
    // Переиспользуем одиночное создание (своя транзакция + аудит на каждый код).
    const created = await createAdminCodeWithAdmin(admin.id, parsed.data.type);
    out.push(created);
  }
  return out;
}

async function createAdminCodeWithAdmin(adminId: string, type: "pro_1m" | "pro_3m" | "pro_1y") {
  const plaintext = `MEKTY-${randomBytes(32).toString("hex")}`;
  const id = new ObjectId();
  const now = new Date();
  const db = await getDb();
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      await db.collection<AdminCodeDocument>(COL.billingCodes).insertOne({
        _id: id, codeHash: hashActivationCode(plaintext), type,
        status: "active", created_at: now, created_by: adminId,
        redeemed_by: null, redeemed_at: null,
      }, { session });
      await db.collection(COL.planEvents).insertOne({
        event: "activation_code_created", user_id: adminId, actor_id: adminId,
        code_id: id, code_type: type, created_at: now,
      }, { session });
    });
  } finally {
    await session.endSession();
  }
  return { id: id.toHexString(), plaintext };
}

/**
 * Ручная выдача Pro по email (продажи без онлайн-оплаты):
 * продлевает от текущего окончания, если оно в будущем.
 */
export async function grantPro(input: unknown) {
  const admin = await requireAdmin();
  await limitAdmin(admin.id, "create");
  const parsed = grantSchema.safeParse(input);
  if (!parsed.success) throw new AdminError(400, "Некорректный email или срок.");
  const db = await getDb();
  const user = await db.collection(COL.users).findOne({ email: parsed.data.email });
  if (!user) throw new AdminError(404, "Пользователь с таким email не найден.");
  const now = new Date();
  const current = user.plan_expires_at instanceof Date ? user.plan_expires_at : null;
  const base = current && current > now ? current : now;
  const expiresAt = extendPlanExpiryLocal(base, parsed.data.type);
  await db.collection(COL.users).updateOne(
    { _id: user._id },
    { $set: { plan: "pro", plan_expires_at: expiresAt } },
  );
  await db.collection(COL.planEvents).insertOne({
    event: "manual_pro_grant", user_id: user._id.toHexString(), actor_id: admin.id,
    previous_plan: user.plan ?? "free", previous_expires_at: current,
    plan: "pro", plan_expires_at: expiresAt, code_type: parsed.data.type, created_at: now,
  });
  return { email: parsed.data.email, expiresAt: expiresAt.toISOString() };
}

function extendPlanExpiryLocal(base: Date, type: "pro_1m" | "pro_3m" | "pro_1y"): Date {
  const result = new Date(base);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + (type === "pro_1y" ? 12 : type === "pro_3m" ? 3 : 1));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}
