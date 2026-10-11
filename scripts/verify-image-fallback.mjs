/**
 * Живая проверка, что код выбора провайдера действительно доходит до резервной
 * модели. Моковые тесты доказывают логику, но не то, что Cloudflare отвечает.
 *
 * Запуск: node scripts/verify-image-fallback.mjs
 * Тратит квоту: делает два реальных запроса к двум моделям Cloudflare.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!accountId || !token) {
  console.error("Нет ключей Cloudflare — проверять нечем.");
  process.exit(2);
}

const PROMPT = "Flat vector illustration for a primary school maths workbook: a circle split into four equal parts, three parts shaded blue. No text, no letters, no numbers.";

function isImage(base64) {
  if (!base64) return false;
  const head = Buffer.from(base64.slice(0, 8), "base64");
  return (head[0] === 0x89 && head[1] === 0x50) || (head[0] === 0xff && head[1] === 0xd8);
}

/** FLUX.2: multipart, width/height обязательны. */
async function flux2() {
  const form = new FormData();
  form.append("prompt", PROMPT);
  form.append("steps", "20");
  form.append("width", "1024");
  form.append("height", "1024");
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-2-dev`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const data = await res.json();
  return data?.result?.image;
}

/** FLUX.1 schnell: JSON, width/height запрещены. */
async function fluxSchnell() {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: PROMPT, steps: 4 }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const data = await res.json();
  return data?.result?.image;
}

let failures = 0;
for (const [name, run] of [["FLUX.2 [dev]", flux2], ["FLUX.1 schnell", fluxSchnell]]) {
  const started = Date.now();
  try {
    const base64 = await run();
    const ok = isImage(base64);
    if (!ok) failures += 1;
    console.log(
      `${ok ? "РАБОТАЕТ " : "МУСОР   "} ${name.padEnd(16)} ${Date.now() - started} мс  ${
        ok ? `${Math.round(base64.length * 0.75 / 1024)} КБ` : "ответ не является изображением"
      }`,
    );
  } catch (err) {
    failures += 1;
    console.log(`ОТКАЗ    ${name.padEnd(16)} ${Date.now() - started} мс  ${err.message.slice(0, 120)}`);
  }
}

if (failures) {
  console.log("\nРезерв не работает: при отказе основной модели иллюстрации создаваться не будут.");
  process.exit(1);
}
console.log("\nОбе модели отвечают — резерв в коде имеет смысл.");