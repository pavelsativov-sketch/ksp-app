#!/usr/bin/env node
/**
 * Одноразовый бэкфилл: проставляет kind у старых документов ai_events.
 *
 * Зачем: учёт квоты теперь считает только события с kind === "slot".
 * Документы, записанные до этого изменения, поля kind не имели — без
 * бэкфилла счётчик месячных лимитов сбросился бы (пользователи получили бы
 * «лишние» бесплатные генерации, а историю/телеметрию нельзя было бы
 * отличить от слотов).
 *
 * Идемпотентен: повторный запуск не меняет уже размеченные документы.
 */

import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI не задан.");
  process.exit(1);
}

const dbName = process.env.MONGODB_DB || "ksp";

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
try {
  await client.connect();
  const db = client.db(dbName);
  const col = db.collection("ai_events");

  const hasKind = { kind: { $exists: true } };
  const noKind = { kind: { $exists: false } };

  // Слоты квоты: имеют seq (частичный уникальный индекс квоты).
  const slots = await col.updateMany(
    { ...noKind, seq: { $type: "number" } },
    { $set: { kind: "slot" } },
  );
  // История AI: schema_version.
  const history = await col.updateMany(
    { ...noKind, schema_version: { $exists: true } },
    { $set: { kind: "history" } },
  );
  // Телеметрия провайдеров: есть provider и duration_ms.
  const telemetry = await col.updateMany(
    { ...noKind, provider: { $exists: true }, duration_ms: { $type: "number" } },
    { $set: { kind: "telemetry" } },
  );
  // Фидбек: есть rating.
  const feedback = await col.updateMany(
    { ...noKind, rating: { $exists: true } },
    { $set: { kind: "feedback" } },
  );
  // Маркеры возвратов.
  const refunds = await col.updateMany(
    { ...noKind, task: "generation_refund" },
    { $set: { kind: "refund" } },
  );
  // Что осталось без kind — помечаем как прочее, чтобы не попадало в лимиты.
  const misc = await col.updateMany({ ...noKind }, { $set: { kind: "misc" } });

  console.log(JSON.stringify({
    slots: slots.modifiedCount,
    history: history.modifiedCount,
    telemetry: telemetry.modifiedCount,
    feedback: feedback.modifiedCount,
    refunds: refunds.modifiedCount,
    misc: misc.modifiedCount,
    unchangedWithKind: await col.countDocuments(hasKind),
  }, null, 2));
} finally {
  await client.close();
}
