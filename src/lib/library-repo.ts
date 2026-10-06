import "server-only";
import type { Db, Document } from "mongodb";
import { COL } from "@/lib/mongo";
import type { PlanDoc } from "@/lib/plans-repo";
import type { PlanListItem } from "@/components/ksp/plans-filter";
import { buildLibraryFilter, LIBRARY_PAGE_SIZE, type LibraryQuery } from "@/lib/library-query";

const QUERY_TIMEOUT_MS = 5000;

export async function listLibraryPlans(db: Db, query: LibraryQuery, subjects: Array<{ id: string; name_ru: string }>) {
  const collection = db.collection<PlanDoc & { likes_count?: number }>(COL.plans);
  const filter = buildLibraryFilter(query, subjects);
  const total = await collection.countDocuments(filter, { maxTimeMS: QUERY_TIMEOUT_MS });
  const pages = Math.max(1, Math.ceil(total / LIBRARY_PAGE_SIZE));
  const page = Math.min(query.page, pages);
  const pagination = [{ $skip: (page - 1) * LIBRARY_PAGE_SIZE }, { $limit: LIBRARY_PAGE_SIZE }];

  // Лайки берутся из материализованного счётчика likes_count в документе
  // плана. Раньше здесь стоял $lookup с `$expr: { $eq: [...] }` — такое
  // сравнение не индексируется, поэтому на каждый план выполнялся COLLSCAN
  // по всей коллекции лайков, а сортировка «по популярности» делала это
  // до пагинации. Счётчик снимает и нагрузку, и возможность сортировать
  // популярность индексом.
  const withLikes: Document[] = [
    { $set: { likes: { $ifNull: ["$likes_count", 0] } } },
  ];

  const sort = query.sort === "title" ? { title: 1, _id: 1 }
    : query.sort === "popularity" ? { likes: -1, created_at: -1, _id: -1 }
    : { created_at: -1, _id: -1 };

  const pipeline: Document[] = [
    { $match: filter },
    ...withLikes,
    // Popularity must be computed BEFORE pagination across all matching plans.
    { $sort: sort },
    ...pagination,
    { $project: { title: 1, grade: 1, subject_id: 1, quarter: 1, updated_at: 1, "content.topic": 1, likes: 1 } },
  ];
  const raw = total ? await collection.aggregate<PlanDoc & { likes: number }>(pipeline, {
    maxTimeMS: QUERY_TIMEOUT_MS, allowDiskUse: true,
  }).toArray() : [];
  const subjectMap = new Map(subjects.map((s) => [s.id, s.name_ru]));
  const plans: PlanListItem[] = raw.map((p) => ({
    id: p._id?.toString() ?? "", title: p.title, grade: p.grade,
    subject_id: p.subject_id, subject_name: subjectMap.get(p.subject_id ?? "") ?? null,
    quarter: p.quarter, topic: p.content?.topic ?? null, likes: p.likes,
    updated_at: p.updated_at instanceof Date ? p.updated_at.toISOString() : String(p.updated_at),
  }));
  return { plans, total, page, pages };
}
