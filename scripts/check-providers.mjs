/**
 * Проверка AI-провайдеров живыми запросами.
 *
 * Наличие ключа в .env.local ничего не значит: ключ может быть отозван,
 * исчерпать квоту или указывать на модель, которой больше нет. Поэтому
 * спрашиваем у каждого провайдера реальный ответ на «2+2».
 *
 * Ключи в вывод не попадают — печатаем только первые 4 символа.
 *
 * Запуск: node scripts/check-providers.mjs
 */

import { readFileSync } from "node:fs";
import path from "node:path";

// Подхватываем ключи из .env.local, как это делает приложение.
for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const mask = (v) => (v ? `${v.slice(0, 4)}…${v.slice(-2)} (${v.length})` : "нет ключа");

const PROVIDERS = [
  {
    id: "gemini",
    key: process.env.GEMINI_API_KEY,
    base: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-3.8-flash",
    url: (base) => `${base}/models/${"gemini-3.8-flash"}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    body: { contents: [{ parts: [{ text: "Ответь одним словом: сколько будет 2+2?" }] }], generationConfig: { maxOutputTokens: 32 } },
  },
  {
    id: "groq",
    key: process.env.GROQ_API_KEY,
    base: "https://api.groq.com/openai/v1",
    model: "openai/gpt-oss-120b",
    url: (base) => `${base}/chat/completions`,
    body: { model: "openai/gpt-oss-120b", messages: [{ role: "user", content: "Ответь одним словом: сколько будет 2+2?" }], max_tokens: 32 },
  },
  {
    id: "cerebras",
    key: process.env.CEREBRAS_API_KEY,
    base: "https://api.cerebras.ai/v1",
    model: "gpt-oss-120b",
    url: (base) => `${base}/chat/completions`,
    body: { model: "gpt-oss-120b", messages: [{ role: "user", content: "Ответь одним словом: сколько будет 2+2?" }], max_tokens: 32 },
  },
  {
    id: "openai",
    key: process.env.OPENAI_API_KEY,
    base: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    url: (base) => `${base}/chat/completions`,
    body: { model: "gpt-4o-mini", messages: [{ role: "user", content: "Ответь одним словом: сколько будет 2+2?" }], max_tokens: 32 },
  },
  {
    id: "openrouter",
    key: process.env.OPENROUTER_API_KEY,
    base: "https://openrouter.ai/api/v1",
    model: "nex-agi/nex-n2.5-pro",
    url: (base) => `${base}/chat/completions`,
    body: { model: "nex-agi/nex-n2.5-pro", messages: [{ role: "user", content: "Ответь одним словом: сколько будет 2+2?" }], max_tokens: 32 },
  },
];

async function check(p) {
  if (!p.key) return { id: p.id, ok: false, why: "ключа нет в окружении", ms: 0 };
  const started = Date.now();
  try {
    // У Google ключ идёт в x-goog-api-key, а Authorization: Bearer там означает
    // OAuth-токен и приводит к 401 даже с живым ключом. Проверяем так, как
    // обращается приложение, — иначе обвиним несуществующий ключ.
    const headers = p.id === "gemini"
      ? { "content-type": "application/json", "x-goog-api-key": p.key }
      : { "content-type": "application/json", authorization: `Bearer ${p.key}` };
    const res = await fetch(p.url(p.base), {
      method: "POST",
      headers,
      body: JSON.stringify(p.body),
      signal: AbortSignal.timeout(90_000),
    });
    const ms = Date.now() - started;
    const text = await res.text();
    if (!res.ok) {
      let why = text.slice(0, 200);
      try {
        const j = JSON.parse(text);
        why = j.error?.message ?? j.message ?? why;
      } catch { /* оставляем как есть */ }
      return { id: p.id, ok: false, why: `HTTP ${res.status}: ${why}`, ms };
    }
    let answer = "";
    try {
      const j = JSON.parse(text);
      answer = j.choices?.[0]?.message?.content ?? j.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    } catch { /* ответ без разбора */ }
    return { id: p.id, ok: true, why: `ответ: ${String(answer).trim().slice(0, 40) || "(пусто)"}`, ms };
  } catch (e) {
    return { id: p.id, ok: false, why: `сеть: ${e instanceof Error ? e.message : String(e)}`, ms: Date.now() - started };
  }
}

const results = [];
for (const p of PROVIDERS) {
  const r = await check(p);
  results.push({ ...r, key: mask(p.key), model: p.model });
  console.log(`${r.ok ? "РАБОТАЕТ" : "НЕ РАБОТАЕТ"}  ${r.id.padEnd(10)} ключ ${mask(p.key).padEnd(28)} модель ${p.model.padEnd(24)} ${r.ms} мс — ${r.why}`);
}

const alive = results.filter((r) => r.ok);
console.log(`\nЖивых провайдеров: ${alive.length} из ${results.length}${alive.length ? ` (${alive.map((r) => r.id).join(", ")})` : ""}`);
process.exit(0);