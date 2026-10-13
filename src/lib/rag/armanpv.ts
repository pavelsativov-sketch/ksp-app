/**
 * Интеграция с официальным каталогом учебников издательства «Арман-ПВ» (https://www.armanpv.com/).
 *
 * Позволяет:
 * 1. Мгновенно искать и фильтровать учебники 1–11 классов (рус/каз/уйг/узб) из локального
 *    слепка каталога `data/armanpv_catalog.json` или напрямую с `https://www.armanpv.com/{grade}-klass`.
 * 2. Скачивать PDF как по прямым ссылкам Wix (`https://www.armanpv.com/_files/ugd/*.pdf`),
 *    так и через публичные папки `https://cloud.mail.ru/public/...` издательства.
 * 3. Индексировать учебник в общую коллекцию `textbooks` (`visibility: "public"`, `owner_id: "system:armanpv"`),
 *    чтобы все учителя школы могли сразу использовать уже проиндексированный учебник без повторного скачивания.
 */

import fs from "node:fs";
import path from "node:path";
import type { Db } from "mongodb";
import { getDb, COL } from "@/lib/mongo";
import {
  ingestTextbookFromBuffer,
  embedTextbookChunks,
  embeddingProgress,
  type TextbookDoc,
} from "./ingest";

export type ArmanPvLanguage = "ru" | "kz" | "ug" | "uz";

export interface ArmanPvCatalogItem {
  id: string;
  grade: number;
  title: string;
  description: string;
  language: ArmanPvLanguage;
  subjectNameRu: string | null;
  isGuide: boolean;
  coverUrl: string | null;
  pdfUrl: string;
  epubUrl: string | null;
  sourcePageUrl: string;
}

export interface ArmanPvCatalogItemWithStatus extends ArmanPvCatalogItem {
  subjectId: string | null;
  ingestedTextbookId: string | null;
  status: "not_ingested" | "pending" | "indexing" | "ready" | "error";
  statusError: string | null;
  pageCount: number | null;
  chunkCount: number;
  embedding: ReturnType<typeof embeddingProgress> | null;
}

const ALLOWED_PDF_HOSTS = [
  "www.armanpv.com",
  "armanpv.com",
  "docs.wixstatic.com",
  "static.wixstatic.com",
  "cloud.mail.ru",
  "s3-almaty.abay.kazteleport.kz",
];

function isAllowedPdfUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (ALLOWED_PDF_HOSTS.includes(host)) return true;
    if (host.endsWith(".datacloudmail.ru") || host.endsWith(".cldmail.ru")) return true;
    return false;
  } catch {
    return false;
  }
}

export function cleanArmanPvText(raw: string | undefined | null): string {
  return (raw || "")
    .replace(/\x00/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&laquo;/gi, "«")
    .replace(/&raquo;/gi, "»")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&copy;/gi, "©")
    .replace(/&#39;/gi, "'")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*—?\s*©\s*20\d\d\s*«Арман-ПВ[\s\S]*$/i, "")
    .trim();
}

export function detectArmanPvLanguage(title: string, desc: string): ArmanPvLanguage {
  const combined = `${title} ${desc}`.toLowerCase();
  if (/ўқувчиларига|дарслик|мактабларининг|умумтаълим|синф/i.test(combined)) return "uz";
  if (/оқуғучилириға|дәрислик|дəрислик|башланғуч|синип|мəктəплəрниң|үчүн/i.test(combined)) return "ug";
  if (
    /[әіңғүұқөһ]/i.test(combined) ||
    /\b(оқулық|сынып|әдістемелік|нұсқаулық|тілі|әдебиеті|өдебиеті|тарихы|дүниежүзі|жаратылыстану|көркем еңбек|құқық негіздері)\b/i.test(combined)
  ) {
    if (
      /учебник для учащихся|методическое руководство|учебник для \d+ класса/i.test(desc) &&
      !/[әіңғүұқөһ]/i.test(desc)
    ) {
      return "ru";
    }
    return "kz";
  }
  return "ru";
}

export function mapArmanPvSubjectNameRu(title: string, desc: string, grade: number): string | null {
  const t = `${title} ${desc}`.toLowerCase().replace(/-\s*/g, "");
  if (
    /цифрлық сауаттылық|цифровая грамотность|цифрлиқ саватлиқ|ақпараттық|информационнокоммуникацион|əхбаратлиқ|ахборот/i.test(
      t,
    )
  ) {
    return grade <= 4 ? "Цифровая грамотность" : "Информатика";
  }
  if (/информатик/i.test(t)) return "Информатика";
  if (/алгебра и начала анализа|алгебра және анализ бастамалары/i.test(t)) {
    return "Алгебра и начала анализа";
  }
  if (/алгебра/i.test(t)) return "Алгебра";
  if (/геометрия/i.test(t)) return "Геометрия";
  if (/математик/i.test(t)) return "Математика";
  if (/физик/i.test(t)) return "Физика";
  if (/хими/i.test(t)) return "Химия";
  if (/биологи/i.test(t)) return "Биология";
  if (/географи/i.test(t)) return "География";
  if (/жаратылыстану|естествознание/i.test(t)) return "Естествознание";
  if (/дүниетану|познание мира/i.test(t)) return "Познание мира";
  if (/қазақстан тарихы|история казахстана/i.test(t)) return "История Казахстана";
  if (/дүниежүзі тарихы|всемирная история/i.test(t)) return "Всемирная история";
  if (
    /құқық негіздері|основы права|предпринимательства и бизнеса|кәсіпкерлік және бизнес|зайырлылық және дінтану|светскость и основы религиоведения|жаһандық құзыреттер|глобальные компетенции/i.test(
      t,
    )
  ) {
    return "Основы права";
  }
  if (/орыс әдебиеті|русская литература/i.test(t)) return "Русская литература";
  if (/орыс тілі|русский язык/i.test(t)) return "Русский язык";
  if (
    /қазақ тілі мен әдебиеті|казахский язык и литература|қазақ әдебиеті|қазақ өдебиеті|казахская литература|абайтану/i.test(
      t,
    )
  ) {
    return "Казахский язык и литература";
  }
  if (/әдебиеттік оқу|литературное чтение/i.test(t)) return "Литературное чтение";
  if (/қазақ тілі|казахский язык|әліппе|букварь|ана тілі/i.test(t)) return "Казахский язык";
  if (/ағылшын|английский/i.test(t)) return "Английский язык";
  if (
    /көркем еңбек|художественный труд|трудовое обучение|еңбекке баулу|изобразительное искусство|бейнелеу өнері/i.test(
      t,
    )
  ) {
    return "Художественный труд";
  }
  if (/музыка/i.test(t)) return "Музыка";
  if (/дене шынықтыру|физическая культура/i.test(t)) return "Физическая культура";
  return null;
}

/**
 * Разбирает HTML страницы класса `https://www.armanpv.com/{grade}-klass`
 * и возвращает найденные учебники и методические пособия.
 */
export function parseArmanPvGradeHtml(html: string, grade: number): ArmanPvCatalogItem[] {
  const pageUrl = `https://www.armanpv.com/${grade}-klass`;
  const parts = html.split('role="listitem"').slice(1);
  const items: ArmanPvCatalogItem[] = [];
  const seenIds = new Set<string>();
  let idx = 0;

  for (const rawPart of parts) {
    const part = rawPart.split(/<footer|id="SITE_FOOTER"/i)[0] ?? rawPart;
    const title = cleanArmanPvText(part.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i)?.[1]);
    if (!title) continue;

    const pMatches = [...part.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => cleanArmanPvText(m[1]))
      .filter((txt) => txt.length > 3 && !/^(pdf|epub|скачать|жүктеу)$/i.test(txt));
    const description = pMatches.join(" — ");

    const directPdf = part.match(
      /href="(https:\/\/www\.armanpv\.com\/_files\/ugd\/[^"]+\.pdf[^"]*)"/i,
    )?.[1];
    const buttonPdf = part.match(/<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?PDF\.png[\s\S]*?<\/a>/i)?.[1];
    const buttonEpub = part.match(/<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?EPUB\.png[\s\S]*?<\/a>/i)?.[1];
    const pdfUrl = (directPdf || buttonPdf || "").trim();
    const epubUrl =
      (
        part.match(/href="(https:\/\/www\.armanpv\.com\/_files\/ugd\/[^"]+\.epub[^"]*)"/i)?.[1] ||
        buttonEpub ||
        ""
      ).trim() || null;

    if (!pdfUrl || !isAllowedPdfUrl(pdfUrl)) continue;

    const imgMatches = [
      ...part.matchAll(/<img[^>]+src="(https:\/\/static\.wixstatic\.com\/media\/[^"]+)"[^>]*>/gi),
    ];
    let coverUrl: string | null = null;
    for (const m of imgMatches) {
      if (!/PDF\.png|EPUB\.png/i.test(m[0])) {
        coverUrl = m[1] ?? null;
        break;
      }
    }

    idx++;
    const language = detectArmanPvLanguage(title, description);
    const subjectNameRu = mapArmanPvSubjectNameRu(title, description, grade);
    const isGuide = /методическ|әдістемелік|нұсқаулық|руководство|хрестоматия/i.test(
      `${title} ${description}`,
    );
    const ugdMatch =
      pdfUrl.match(/ugd\/([a-f0-9_]+)/i) || pdfUrl.match(/public\/([a-zA-Z0-9/_-]+)/i);
    const hashKey = (ugdMatch ? ugdMatch[1]! : `${grade}_${idx}`).replace(/[^a-zA-Z0-9_-]/g, "_");
    let id = `armanpv_${grade}_${hashKey}`;
    if (seenIds.has(id)) id = `${id}_${idx}`;
    seenIds.add(id);

    items.push({
      id,
      grade,
      title,
      description,
      language,
      subjectNameRu,
      isGuide,
      coverUrl,
      pdfUrl,
      epubUrl,
      sourcePageUrl: pageUrl,
    });
  }

  return items;
}

let catalogCache: ArmanPvCatalogItem[] | null = null;

export function loadArmanPvCatalog(): ArmanPvCatalogItem[] {
  if (catalogCache) return catalogCache;
  try {
    const file = path.resolve(process.cwd(), "data", "armanpv_catalog.json");
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as ArmanPvCatalogItem[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        catalogCache = parsed;
        return catalogCache;
      }
    }
  } catch (e) {
    console.warn("Failed to read data/armanpv_catalog.json:", e);
  }
  catalogCache = [];
  return catalogCache;
}

/**
 * Живое обновление списка учебников выбранного класса с `https://www.armanpv.com/{grade}-klass`.
 * При успехе обновляет записи этого класса в памяти.
 */
export async function fetchArmanPvGradeLive(grade: number): Promise<ArmanPvCatalogItem[]> {
  if (!Number.isInteger(grade) || grade < 1 || grade > 11) return [];
  const url = `https://www.armanpv.com/${grade}-klass`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; KspAppArmanPvSync/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Сайт armanpv.com вернул статус ${res.status}`);
  }
  const html = await res.text();
  const liveItems = parseArmanPvGradeHtml(html, grade);
  if (liveItems.length > 0) {
    const current = loadArmanPvCatalog();
    const others = current.filter((item) => item.grade !== grade);
    catalogCache = [...others, ...liveItems].sort((a, b) => a.grade - b.grade);
  }
  return liveItems;
}

/**
 * Преобразует ссылку `https://cloud.mail.ru/public/...` в прямую ссылку на скачивание PDF
 * через официальный dispatcher Cloud Mail.ru, либо возвращает прямую ссылку `armanpv.com/_files/ugd/*.pdf`.
 */
export async function resolveArmanPvPdfUrl(pdfUrl: string): Promise<string> {
  if (!isAllowedPdfUrl(pdfUrl)) {
    throw new Error("Недопустимый домен источника PDF");
  }
  const u = new URL(pdfUrl);
  if (u.hostname.toLowerCase() === "cloud.mail.ru") {
    const match = u.pathname.match(/^\/public\/(.+)$/);
    if (!match?.[1]) {
      throw new Error("Некорректная публичная ссылка Cloud Mail.ru");
    }
    const weblink = match[1];
    const dispRes = await fetch("https://cloud.mail.ru/api/v2/dispatcher", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!dispRes.ok) {
      throw new Error(`Не удалось получить сервер скачивания Cloud Mail.ru (${dispRes.status})`);
    }
    const dispJson = (await dispRes.json()) as {
      body?: { weblink_get?: Array<{ url?: string }> };
    };
    const baseUrl = dispJson.body?.weblink_get?.[0]?.url;
    if (!baseUrl || !isAllowedPdfUrl(baseUrl)) {
      throw new Error("Cloud Mail.ru не вернул допустимый адрес скачивания");
    }
    return `${baseUrl.replace(/\/$/, "")}/${weblink}`;
  }
  return pdfUrl;
}

const MAX_ARMANPV_PDF_BYTES = 85 * 1024 * 1024; // до 85 МБ для полноцветных учебников

export async function downloadArmanPvPdf(item: Pick<ArmanPvCatalogItem, "pdfUrl" | "title">): Promise<Buffer> {
  const directUrl = await resolveArmanPvPdfUrl(item.pdfUrl);
  if (!isAllowedPdfUrl(directUrl)) {
    throw new Error("Недопустимый URL для скачивания учебника");
  }
  const res = await fetch(directUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; KspAppArmanPvBot/1.0)",
      Accept: "application/pdf,application/octet-stream,*/*",
    },
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    throw new Error(`Не удалось скачать PDF «${item.title}» с armanpv.com (HTTP ${res.status})`);
  }
  const contentLength = Number(res.headers.get("content-length") || "0");
  if (contentLength > MAX_ARMANPV_PDF_BYTES) {
    throw new Error(
      `PDF учебника «${item.title}» слишком большой (${Math.round(contentLength / 1024 / 1024)} МБ)`,
    );
  }
  const arr = new Uint8Array(await res.arrayBuffer());
  if (arr.byteLength > MAX_ARMANPV_PDF_BYTES) {
    throw new Error("Превышен допустимый размер PDF учебника");
  }
  const buf = Buffer.from(arr);
  const header = buf.subarray(0, 8).toString("latin1");
  if (!header.includes("%PDF-")) {
    throw new Error("Скачанный файл не является корректным PDF-документом");
  }
  return buf;
}

export function formatArmanPvTextbookTitle(item: ArmanPvCatalogItem): string {
  const langLabel =
    item.language === "kz"
      ? "Қаз"
      : item.language === "ru"
        ? "Рус"
        : item.language === "ug"
          ? "Ұйғ"
          : "O‘zb";
  const kindLabel = item.isGuide ? ", әдістемелік/метод." : "";
  return `${item.title} (${item.grade} кл., Арман-ПВ, ${langLabel}${kindLabel})`;
}

type ArmanPvIngestResult = {
  textbook: TextbookDoc & { id: string };
  item: ArmanPvCatalogItem;
  cached: boolean;
};

const inFlightIngestions = new Map<string, Promise<ArmanPvIngestResult>>();

/**
 * Гарантирует, что выбранный учебник из каталога Арман-ПВ скачан, разбит на чанки
 * и сохранён в коллекции `textbooks` с `visibility: "public"`.
 * Если учебник уже был проиндексирован ранее — мгновенно возвращает готовый документ.
 * При одновременном запросе одного и того же учебника несколькими учителями
 * дедуплицирует скачивание и парсинг PDF через in-flight промис.
 */
export async function ensureArmanPvTextbookIngested(opts: {
  armanpvId: string;
  subjectId?: string | null;
  db?: Db;
}): Promise<ArmanPvIngestResult> {
  const active = inFlightIngestions.get(opts.armanpvId);
  if (active) return active;

  const promise = runArmanPvIngestion(opts).finally(() => {
    inFlightIngestions.delete(opts.armanpvId);
  });
  inFlightIngestions.set(opts.armanpvId, promise);
  return promise;
}

async function runArmanPvIngestion(opts: {
  armanpvId: string;
  subjectId?: string | null;
  db?: Db;
}): Promise<ArmanPvIngestResult> {
  const catalog = loadArmanPvCatalog();
  const item = catalog.find((c) => c.id === opts.armanpvId);
  if (!item) {
    throw new Error("Учебник не найден в каталоге Арман-ПВ");
  }

  const db = opts.db ?? (await getDb());
  const textbooksCol = db.collection<TextbookDoc>(COL.textbooks);

  // Resolves subject_id from DB if not explicitly passed
  let resolvedSubjectId = opts.subjectId ?? null;
  if (!resolvedSubjectId && item.subjectNameRu) {
    const subjDoc = await db
      .collection<{ name_ru: string }>(COL.subjects)
      .findOne({ name_ru: item.subjectNameRu });
    if (subjDoc && "_id" in subjDoc && subjDoc._id) {
      resolvedSubjectId = subjDoc._id.toString();
    }
  }

  const existing = await textbooksCol.findOne({ armanpv_id: item.id });
  if (existing && existing._id && existing.status === "ready" && existing.chunk_count > 0) {
    // Если ещё не все чанки имеют эмбеддинги — продвигаем один пакет фоново
    if (!existing.has_embeddings && existing.embedding_status !== "processing") {
      void embedTextbookChunks(existing._id.toString(), db).catch(() => {});
    }
    return {
      textbook: { ...existing, id: existing._id.toString() },
      item,
      cached: true,
    };
  }

  const now = new Date();
  let textbookId: string;
  if (existing && existing._id) {
    textbookId = existing._id.toString();
    await textbooksCol.updateOne(
      { _id: existing._id },
      {
        $set: {
          title: formatArmanPvTextbookTitle(item),
          subject_id: resolvedSubjectId ?? existing.subject_id,
          grade: item.grade,
          status: "indexing",
          status_error: null,
          visibility: "public",
          armanpv_id: item.id,
          source_url: item.pdfUrl,
          cover_url: item.coverUrl,
          language: item.language,
          updated_at: now,
        },
      },
    );
  } else {
    const inserted = await textbooksCol.insertOne({
      owner_id: "system:armanpv",
      title: formatArmanPvTextbookTitle(item),
      subject_id: resolvedSubjectId,
      grade: item.grade,
      status: "pending",
      status_error: null,
      page_count: null,
      chunk_count: 0,
      visibility: "public",
      has_embeddings: false,
      armanpv_id: item.id,
      source_url: item.pdfUrl,
      cover_url: item.coverUrl,
      language: item.language,
      created_at: now,
      updated_at: now,
    });
    textbookId = inserted.insertedId.toString();
  }

  const pdfBuffer = await downloadArmanPvPdf(item);
  await ingestTextbookFromBuffer({ db, textbookId, pdfBuffer });

  // Сразу запускаем первый пакет эмбеддингов (до 64 чанков), не блокируя ошибку если провайдер недоступен
  try {
    await embedTextbookChunks(textbookId, db);
  } catch {
    // Поиск по ключевым словам уже работает по всем чанкам
  }

  const finalDoc = await textbooksCol.findOne({ armanpv_id: item.id });
  if (!finalDoc || !finalDoc._id) {
    throw new Error("Не удалось прочитать сохранённый учебник Арман-ПВ");
  }

  return {
    textbook: { ...finalDoc, id: finalDoc._id.toString() },
    item,
    cached: false,
  };
}
