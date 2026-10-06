/**
 * Долгосрочные (ДСП) и среднесрочные (ССП) планы — слой данных.
 *
 * ДСП — годовой план по предмету: разделы → темы с часами и целями.
 * ССП — план на четверть: привязан к ДСП, содержит темы со ссылками на КСП.
 */

import { getDb, COL, toObjectId } from "@/lib/mongo";
import type { ObjectId } from "mongodb";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LongTermTopic {
  title: string;
  hours: number;
  objectives: string;
}

export interface LongTermSection {
  title: string;
  topics: LongTermTopic[];
}

export interface LongTermPlan {
  id: string;
  owner_id: string;
  subject: string;
  grade: number;
  year: string;
  sections: LongTermSection[];
  created_at: string;
  updated_at: string;
}

export interface MediumTermTopic {
  title: string;
  hours: number;
  kspIds: string[];
}

export interface MediumTermPlan {
  id: string;
  owner_id: string;
  longTermId: string;
  quarter: number;
  title: string;
  topics: MediumTermTopic[];
  created_at: string;
  updated_at: string;
}

// ─── Document shapes (MongoDB) ───────────────────────────────────────────────

interface LongTermDoc {
  _id?: ObjectId;
  owner_id: string;
  subject: string;
  grade: number;
  year: string;
  sections: LongTermSection[];
  created_at: Date;
  updated_at: Date;
}

interface MediumTermDoc {
  _id?: ObjectId;
  owner_id: string;
  longTermId: string;
  quarter: number;
  title: string;
  topics: MediumTermTopic[];
  created_at: Date;
  updated_at: Date;
}

// ─── Mappers ────────────────────────────────────────────────────────────────

function toLongTermRow(doc: LongTermDoc): LongTermPlan {
  return {
    id: doc._id ? doc._id.toString() : "",
    owner_id: doc.owner_id,
    subject: doc.subject,
    grade: doc.grade,
    year: doc.year,
    sections: doc.sections,
    created_at: doc.created_at.toISOString(),
    updated_at: doc.updated_at.toISOString(),
  };
}

function toMediumTermRow(doc: MediumTermDoc): MediumTermPlan {
  return {
    id: doc._id ? doc._id.toString() : "",
    owner_id: doc.owner_id,
    longTermId: doc.longTermId,
    quarter: doc.quarter,
    title: doc.title,
    topics: doc.topics,
    created_at: doc.created_at.toISOString(),
    updated_at: doc.updated_at.toISOString(),
  };
}

// ─── ДСП CRUD ───────────────────────────────────────────────────────────────

export async function createLongTermPlan(
  ownerId: string,
  data: { subject: string; grade: number; year: string; sections?: LongTermSection[] },
): Promise<LongTermPlan> {
  const db = await getDb();
  const now = new Date();
  const doc: LongTermDoc = {
    owner_id: ownerId,
    subject: data.subject,
    grade: data.grade,
    year: data.year,
    sections: data.sections ?? [],
    created_at: now,
    updated_at: now,
  };
  const result = await db.collection<LongTermDoc>(COL.longtermPlans).insertOne(doc);
  return toLongTermRow({ ...doc, _id: result.insertedId });
}

export async function getLongTermPlan(id: string): Promise<LongTermPlan | null> {
  const oid = toObjectId(id);
  if (!oid) return null;
  const db = await getDb();
  const doc = await db.collection<LongTermDoc>(COL.longtermPlans).findOne({ _id: oid });
  return doc ? toLongTermRow(doc) : null;
}

export async function updateLongTermPlan(
  id: string,
  data: Partial<Pick<LongTermDoc, "subject" | "grade" | "year" | "sections">>,
): Promise<LongTermPlan | null> {
  const oid = toObjectId(id);
  if (!oid) return null;
  const db = await getDb();
  const update: Record<string, unknown> = { updated_at: new Date() };
  if (data.subject !== undefined) update.subject = data.subject;
  if (data.grade !== undefined) update.grade = data.grade;
  if (data.year !== undefined) update.year = data.year;
  if (data.sections !== undefined) update.sections = data.sections;
  const doc = await db
    .collection<LongTermDoc>(COL.longtermPlans)
    .findOneAndUpdate({ _id: oid }, { $set: update }, { returnDocument: "after" });
  return doc ? toLongTermRow(doc) : null;
}

export async function deleteLongTermPlan(id: string): Promise<boolean> {
  const oid = toObjectId(id);
  if (!oid) return false;
  const db = await getDb();
  // Каскад: без удаления связанных ССП они остались бы сиротами,
  // недостижимыми из UI (список ССП строится только от своего ДСП).
  //
  // Порядок и атомарность важны. Раньше ССП удалялись ПЕРВЫМИ, а само ДСП —
  // следом, и всё это без транзакции: если deleteOne ДСП падал (гонка,
  // обрыв сети), ССП уже были стёрты безвозвратно, а ДСП оставалось
  // видимым с «пустым» содержанием. Теперь сначала удаляется родитель,
  // и только если он действительно удалён — дети, всё в одной транзакции.
  const session = db.client.startSession();
  try {
    let deleted = false;
    await session.withTransaction(async () => {
      const result = await db
        .collection<LongTermDoc>(COL.longtermPlans)
        .deleteOne({ _id: oid }, { session });
      if (result.deletedCount === 0) return;
      deleted = true;
      await db
        .collection<MediumTermDoc>(COL.mediumtermPlans)
        .deleteMany({ longTermId: id }, { session });
    });
    return deleted;
  } finally {
    await session.endSession();
  }
}

export async function listLongTermPlans(ownerId: string): Promise<LongTermPlan[]> {
  const db = await getDb();
  const docs = await db
    .collection<LongTermDoc>(COL.longtermPlans)
    .find({ owner_id: ownerId })
    .sort({ updated_at: -1 })
    .toArray();
  return docs.map(toLongTermRow);
}

// ─── ССП CRUD ───────────────────────────────────────────────────────────────

export async function createMediumTermPlan(
  ownerId: string,
  data: { longTermId: string; quarter: number; title: string; topics?: MediumTermTopic[] },
): Promise<MediumTermPlan> {
  const db = await getDb();
  const now = new Date();
  const doc: MediumTermDoc = {
    owner_id: ownerId,
    longTermId: data.longTermId,
    quarter: data.quarter,
    title: data.title,
    topics: data.topics ?? [],
    created_at: now,
    updated_at: now,
  };
  const result = await db.collection<MediumTermDoc>(COL.mediumtermPlans).insertOne(doc);
  return toMediumTermRow({ ...doc, _id: result.insertedId });
}

export async function getMediumTermPlan(id: string): Promise<MediumTermPlan | null> {
  const oid = toObjectId(id);
  if (!oid) return null;
  const db = await getDb();
  const doc = await db.collection<MediumTermDoc>(COL.mediumtermPlans).findOne({ _id: oid });
  return doc ? toMediumTermRow(doc) : null;
}

export async function updateMediumTermPlan(
  id: string,
  data: Partial<Pick<MediumTermDoc, "quarter" | "title" | "topics">>,
): Promise<MediumTermPlan | null> {
  const oid = toObjectId(id);
  if (!oid) return null;
  const db = await getDb();
  const update: Record<string, unknown> = { updated_at: new Date() };
  if (data.quarter !== undefined) update.quarter = data.quarter;
  if (data.title !== undefined) update.title = data.title;
  if (data.topics !== undefined) update.topics = data.topics;
  const doc = await db
    .collection<MediumTermDoc>(COL.mediumtermPlans)
    .findOneAndUpdate({ _id: oid }, { $set: update }, { returnDocument: "after" });
  return doc ? toMediumTermRow(doc) : null;
}

export async function deleteMediumTermPlan(id: string): Promise<boolean> {
  const oid = toObjectId(id);
  if (!oid) return false;
  const db = await getDb();
  const result = await db.collection<MediumTermDoc>(COL.mediumtermPlans).deleteOne({ _id: oid });
  return result.deletedCount > 0;
}

export async function getMediumTermPlans(
  ownerId: string,
  filters?: { longTermId?: string; quarter?: number },
): Promise<MediumTermPlan[]> {
  const db = await getDb();
  const query: Record<string, unknown> = { owner_id: ownerId };
  if (filters?.longTermId) query.longTermId = filters.longTermId;
  if (filters?.quarter !== undefined) query.quarter = filters.quarter;
  const docs = await db
    .collection<MediumTermDoc>(COL.mediumtermPlans)
    .find(query)
    .sort({ updated_at: -1 })
    .toArray();
  return docs.map(toMediumTermRow);
}

// ─── Link КСП → ССП ─────────────────────────────────────────────────────────

export async function linkKspToMediumTerm(
  mediumTermId: string,
  kspId: string,
): Promise<MediumTermPlan | null> {
  const oid = toObjectId(mediumTermId);
  if (!oid) return null;
  const db = await getDb();
  // Add kspId to the first topic that doesn't already have it, or create a new topic
  const doc = await db.collection<MediumTermDoc>(COL.mediumtermPlans).findOne({ _id: oid });
  if (!doc) return null;

  const topics = [...doc.topics];
  // Find a topic to link to — for now, add to the last topic or create a new one
  if (topics.length === 0) {
    topics.push({ title: "", hours: 1, kspIds: [kspId] });
  } else {
    const lastTopic = { ...topics[topics.length - 1] };
    if (!lastTopic.kspIds.includes(kspId)) {
      lastTopic.kspIds = [...lastTopic.kspIds, kspId];
    }
    topics[topics.length - 1] = lastTopic;
  }

  const updated = await db
    .collection<MediumTermDoc>(COL.mediumtermPlans)
    .findOneAndUpdate(
      { _id: oid },
      { $set: { topics, updated_at: new Date() } },
      { returnDocument: "after" },
    );
  return updated ? toMediumTermRow(updated) : null;
}

export async function unlinkKspFromMediumTerm(
  mediumTermId: string,
  kspId: string,
): Promise<MediumTermPlan | null> {
  const oid = toObjectId(mediumTermId);
  if (!oid) return null;
  const db = await getDb();
  const doc = await db.collection<MediumTermDoc>(COL.mediumtermPlans).findOne({ _id: oid });
  if (!doc) return null;

  const topics = doc.topics.map((t) => ({
    ...t,
    kspIds: t.kspIds.filter((id) => id !== kspId),
  }));

  const updated = await db
    .collection<MediumTermDoc>(COL.mediumtermPlans)
    .findOneAndUpdate(
      { _id: oid },
      { $set: { topics, updated_at: new Date() } },
      { returnDocument: "after" },
    );
  return updated ? toMediumTermRow(updated) : null;
}
