/**
 * Сброс лимитов входа для тестовых аккаунтов.
 *
 * Зачем. Сервер разрешает 10 входов на одну почту за 15 минут. Пока сценарии
 * входили сами по себе, прогон упирался в этот лимит и падал с сообщением
 * про вход — то есть проверял не то, что задумано. Теперь вход делается один
 * раз (проект setup), но лимит всё равно копится между прогонами: три
 * прогона подряд — и четвёртый уже не войдёт.
 *
 * Сбрасываются ТОЛЬКО ключи вида auth:login:<почта> и auth:register:<почта>,
 * где почта принадлежит тестовым аккаунтам (домен @example.test). Ничьи
 * реальные лимиты не затрагиваются.
 *
 * Запуск: node scripts/reset-test-rate-limits.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { MongoClient } from "mongodb";

const ACCOUNTS_PATH = resolve(process.cwd(), "tests", "e2e", ".accounts.json");

if (!existsSync(ACCOUNTS_PATH)) {
  console.error(`Нет файла тестовых аккаунтов: ${ACCOUNTS_PATH}`);
  process.exit(2);
}

const { accounts } = JSON.parse(readFileSync(ACCOUNTS_PATH, "utf8"));

if (!Array.isArray(accounts) || accounts.length === 0) {
  console.error("В файле нет аккаунтов.");
  process.exit(2);
}

// Страховка: трогаем только тестовые почты. Домен example.test зарезервирован
// под документацию и не может принадлежать живому учителю.
const emails = accounts.map((a) => a.email).filter((email) => String(email).endsWith("@example.test"));
if (emails.length !== accounts.length) {
  console.error("В файле есть не тестовые адреса — сброс прерван.");
  process.exit(2);
}

const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;
if (!uri || !dbName) {
  console.error("Нет MONGODB_URI или MONGODB_DB в .env.local");
  process.exit(2);
}

// Имя коллекции берём из исходников, а не выдумываем: в проекте она
// называется rate_limits, и при неверном имени сброс молча ничего не делал.
const RATE_LIMITS_COLLECTION = "rate_limits";
const client = new MongoClient(uri);
try {
  await client.connect();
  const col = client.db(dbName).collection(RATE_LIMITS_COLLECTION);

  // Ключи строятся из почты; удаляем по префиксу, а не перебором полного
  // списка — так не зависит от того, сколько окон накопилось.
  let removed = 0;
  for (const email of emails) {
    const res = await col.deleteMany({
      _id: { $in: [`auth:login:${email.toLowerCase()}`, `auth:register:${email.toLowerCase()}`] },
    });
    removed += res.deletedCount ?? 0;
  }

  console.log(`Сброшено ключей лимитов: ${removed} (аккаунтов: ${emails.length})`);
} finally {
  await client.close();
}