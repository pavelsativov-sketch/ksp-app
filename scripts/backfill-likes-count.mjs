/**
 * Разовый бэкфилл: проставляет планам материализованный счётчик лайков.
 *
 * Зачем: список библиотеки больше не делает $lookup по коллекции лайков
 * (сравнение через $expr не индексируется и давало COLLSCAN на каждый
 * план), а читает `likes_count` прямо из документа. У планов, созданных
 * до этого изменения, поля нет — без бэкфилла они показывали бы 0 лайков,
 * что хуже, чем старый (медленный, но верный) подсчёт.
 *
 * Запуск:  node scripts/backfill-likes-count.mjs
 */
import { config } from "dotenv";
import { MongoClient } from "mongodb";

config({ path: ".env.local", override: true });

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

if (!uri || !dbName) {
  console.error("Не заданы MONGODB_URI или MONGODB_DB");
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

console.log("Считаем лайки по планам…");
const counts = await db
  .collection("lesson_plan_likes")
  .aggregate([
    { $group: { _id: "$plan_id", n: { $sum: 1 } } },
  ])
  .toArray();

const map = new Map(counts.map((row) => [String(row._id), row.n]));
console.log(`Планов с лайками: ${map.size}`);

const plans = db.collection("lesson_plans");
const all = await plans.find({}).project({ _id: 1, likes_count: 1 }).toArray();

let updated = 0;
for (const plan of all) {
  const id = String(plan._id);
  const target = map.get(id) ?? 0;
  if (plan.likes_count === target) continue;
  await plans.updateOne({ _id: plan._id }, { $set: { likes_count: target } });
  updated += 1;
}

console.log(`Обновлено планов: ${updated} из ${all.length}`);
await client.close();