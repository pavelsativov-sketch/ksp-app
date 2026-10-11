/**
 * Живая проверка провайдеров генерации изображений.
 *
 * Отвечает на вопрос, какие модели реально работают на текущих ключах, и
 * отдельно перечисляет известные провайдеры, которые НЕ подключены, — чтобы
 * список кандидатов для подключения был проверенным, а не предположением.
 *
 * Запуск: node scripts/probe-image-providers.mjs
 * Тратит квоту: на каждый провайдер уходит один реальный запрос.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Ключи из .env.local — как в остальных скриптах проекта.
const envPath = resolve(process.cwd(), ".env.local");
try {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {
  console.warn(".env.local не найден — проверьте ключи вручную");
}

const PROMPT = "Bright flat vector illustration for a children's maths textbook: a circle divided into four equal parts, three parts shaded blue. No text, no letters, no numbers.";

/** Проверка одного провайдера: одна попытка, без повторов. */
async function probe(label, run) {
  const started = Date.now();
  try {
    const result = await run();
    const ok = result.base64 && result.base64.length > 1000;
    console.log(
      `${ok ? "РАБОТАЕТ" : "ОТВЕТ БЕЗ КАРТИНКИ"}  ${label}  ${Date.now() - started} мс  ${
        result.base64 ? `${Math.round(result.base64.length / 1024)} КБ base64` : (result.detail ?? "").slice(0, 120)
      }`,
    );
    return ok;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`НЕ РАБОТАЕТ   ${label}  ${Date.now() - started} мс  ${message.slice(0, 140)}`);
    return false;
  }
}

/** Минимальная проверка: начинается ли base64 с сигнатуры PNG или JPEG. */
function isImage(base64) {
  if (!base64) return false;
  const head = Buffer.from(base64.slice(0, 8), "base64");
  const png = head[0] === 0x89 && head[1] === 0x50;
  const jpg = head[0] === 0xff && head[1] === 0xd8;
  return png || jpg;
}

async function probeGemini(model) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("нет GEMINI_API_KEY");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }] }],
        generationConfig: { responseModalities: ["TEXT", "image"] },
      }),
      signal: AbortSignal.timeout(120_000),
    },
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 120)}`);
  }
  const data = await response.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const image = parts.find((p) => p.inlineData?.data)?.inlineData;
  if (!image) {
    // Ответ без inlineData: модель ответила текстом. Для генератора картинок
    // это равносильно отказу, и тратить на такую модель квоту нельзя.
    const text = parts.map((p) => p.text ?? "").join(" ").slice(0, 80);
    throw new Error(`ответ без изображения${text ? `: «${text}»` : ""}`);
  }
  return { base64: isImage(image.data) ? image.data : "" };
}

async function probeCloudflare(model) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) throw new Error("нет ключей Cloudflare");
  const form = new FormData();
  form.append("prompt", PROMPT);
  form.append("steps", "20");
  form.append("width", "1024");
  form.append("height", "1024");
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 140)}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const data = await response.json();
    return { base64: isImage(data?.result?.image) ? data.result.image : "", detail: JSON.stringify(data).slice(0, 120) };
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return { base64: isImage(buffer.toString("base64")) ? buffer.toString("base64") : "", detail: contentType };
}

console.log("Проверка провайдеров изображений (каждый — один реальный запрос)\n");
const working = [];
const check = async (label, run) => { if (await probe(label, run)) working.push(label); };

// Gemini проверяем поимённо: у Google модели с картинками и без них названы
// по-разному, и молчаливый отказ «текстом вместо картинки» стоит квоты.
for (const model of [
  "gemini-3.8-flash",
  "gemini-2.5-flash-image",
  "gemini-2.0-flash-preview-image-generation",
]) {
  await check(`Gemini ${model}`, () => probeGemini(model));
}
for (const model of [
  "@cf/black-forest-labs/flux-2-dev",
  "@cf/black-forest-labs/flux-1.1-pro",
  "@cf/black-forest-labs/flux-1-schnell",
]) {
  await check(`Cloudflare ${model.split("/").pop()}`, () => probeCloudflare(model));
}

if (process.env.OPENAI_API_KEY) {
  await check("OpenAI DALL-E 3", async () => {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "dall-e-3", prompt: PROMPT, n: 1, size: "1024x1024", response_format: "b64_json" }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 120)}`);
    const data = await response.json();
    const base64 = data?.data?.[0]?.b64_json;
    return { base64: isImage(base64) ? base64 : "", detail: "нет b64_json" };
  });
} else {
  console.log("ПРОПУЩЕН      OpenAI DALL-E 3 — нет OPENAI_API_KEY");
}

console.log(`\nИтог: работающих провайдеров — ${working.length}`);
if (working.length) console.log(working.map((w) => `  + ${w}`).join("\n"));
console.log("\nСовет: в код подключаются только те, что напечатаны как РАБОТАЕТ.");