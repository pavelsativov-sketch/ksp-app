/**
 * Живая проверка потока генерации КСП: идут ли проценты с сервера.
 *
 * Ожидание: сначала 5% («разбираем тему»), потом либо 10% («ищем в учебнике»),
 * либо 20% («составляем ход урока»), и в конце 100% вместе с результатом.
 * Повторяющиеся или скачущие назад проценты означали бы, что поток шлёт
 * мусор вместо хода работы.
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const account = JSON.parse(readFileSync("tests/e2e/.accounts.json", "utf8")).accounts[0];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(`${BASE}/login`);
await page.fill("#email", account.email);
await page.fill("#password", account.password);
await Promise.all([
  page.waitForURL(/\/(dashboard|welcome|plans)/, { timeout: 30_000 }),
  page.getByRole("button", { name: /войти/i }).click(),
]);
const skip = page.getByRole("button", { name: /пропустить/i });
if (await skip.isVisible({ timeout: 8_000 }).catch(() => false)) await skip.click();
console.log("вошли как", account.email);

const result = await page.evaluate(async (base) => {
  const res = await fetch(`${base}/api/ai/generate/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      grade: 5,
      subject: "Математика",
      topic: "Дроби: сложение и вычитание",
      learningObjectives: ["Складывать дроби с одинаковыми знаменателями"],
      language: "ru",
    }),
  });

  if (!res.ok) return { status: res.status, frames: [], error: (await res.text()).slice(0, 200) };
  if (!res.body) return { status: res.status, frames: [], error: "потока нет" };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const frames = [];
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let b = buffer.indexOf("\n\n");
    while (b !== -1) {
      const frame = buffer.slice(0, b).trim();
      buffer = buffer.slice(b + 2);
      if (frame.startsWith("data:")) {
        try {
          frames.push(JSON.parse(frame.slice(5).trim()));
        } catch {}
      }
      b = buffer.indexOf("\n\n");
    }
  }
  return { status: res.status, frames, error: null };
}, BASE);

console.log("HTTP:", result.status);
if (result.error) console.log("ошибка:", result.error);

const progress = result.frames.filter((f) => f.type === "progress");
const done = result.frames.find((f) => f.type === "done");
const failed = result.frames.find((f) => f.type === "error");

console.log("\nкадры прогресса:");
for (const f of progress) console.log(`   ${f.percent}%  ${f.label}`);

const percents = progress.map((f) => f.percent);
const failures = [];

// Порядок должен быть неубывающим: назад проценты не ходят.
for (let i = 1; i < percents.length; i++) {
  if (percents[i] < percents[i - 1]) failures.push(`процент ушёл назад: ${percents[i - 1]} → ${percents[i]}`);
}
// Первый этап обязан прийти сразу, а не после минуты ожидания.
if (progress.length === 0) failures.push("ни одного кадра прогресса не пришло");
else if (progress[0].percent > 20) failures.push(`первый кадр пришёл на ${progress[0].percent}% — ход работы не виден сразу`);
// Завершение — это ровно 100% и результат рядом.
if (!done) {
  failures.push(failed ? `генерация упала: ${String(failed.error).slice(0, 120)}` : "кадра done нет");
} else {
  if (percents[percents.length - 1] !== 100) failures.push(`последний процент ${percents[percents.length - 1]}, а не 100`);
  // Схема КСП: тема лежит в `topic`, этапы — объект `beginning/middle/end`,
  // а не массив. Проверка на длину массива здесь всегда давала бы 0.
  const topic = done.content?.topic ?? "";
  const stages = done.content?.stages ?? {};
  const filled = ["beginning", "middle", "end"].filter(
    (k) => stages[k] && String(stages[k].name ?? stages[k].teacherActions ?? "").trim().length > 0,
  );
  if (!topic) failures.push("в результате нет темы урока");
  if (filled.length === 0) failures.push("в результате нет этапов урока");
  if (percents.filter((p) => p === 100).length > 1) {
    failures.push("кадр 100% пришёл дважды — это дубль этапа, а не новый шаг");
  }
  console.log("\nрезультат:", JSON.stringify({ topic, этапов: filled }));
}

await browser.close();

if (failures.length) {
  console.log("\nПРОВАЛ:");
  for (const f of failures) console.log("  -", f);
  process.exit(1);
}
console.log("\nOK: проценты идут с сервера, порядок верный, на 100% приходит результат.");
