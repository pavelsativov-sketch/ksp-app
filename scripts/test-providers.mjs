/**
 * Прямой тест AI-провайдеров (без HTTP, без авторизации).
 * Проверяет все 4 модели напрямую.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Inline env loading
const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

import OpenAI from "openai";

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/";
const GROQ_BASE = "https://api.groq.com/openai/v1";

async function testModel(label, baseURL, apiKey, model, prompt) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`🔄 ${label} [${model}]`);
  const start = Date.now();
  try {
    const client = new OpenAI({ apiKey, baseURL });
    const res = await client.chat.completions.create({
      model,
      temperature: 0.7,
      messages: [
        { role: "system", content: "Ты помощник учителя в Казахстане. Отвечай кратко и по делу." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const raw = res.choices[0]?.message?.content || "";
    const parsed = JSON.parse(raw);
    console.log(`✅ Успех за ${elapsed}с`);
    console.log(`   Размер: ${raw.length} символов`);
    console.log(`   Ключи: ${Object.keys(parsed).join(", ")}`);
    const preview = raw.slice(0, 200);
    console.log(`   Превью: ${preview}${raw.length > 200 ? "…" : ""}`);
    return { ok: true, elapsed, size: raw.length };
  } catch (e) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`❌ Ошибка за ${elapsed}с: ${e.message}`);
    return { ok: false, elapsed, error: e.message };
  }
}

async function testImage() {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`🔄 🖼️ Генерация картинки [gemini-3.1-flash-image]`);
  const start = Date.now();
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${GEMINI_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Нарисуй числовую линейку с дробями 1/4, 2/4, 3/4 для урока математики. Яркая инфографика для 5 класса." }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"], temperature: 0.8 },
      }),
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    if (!res.ok) {
      const err = await res.text();
      console.log(`❌ HTTP ${res.status} за ${elapsed}с: ${err.slice(0, 300)}`);
      return { ok: false, elapsed };
    }
    const data = await res.json();
    let imageFound = false;
    for (const c of data.candidates || []) {
      for (const p of c.content?.parts || []) {
        if (p.inlineData?.data) {
          const kb = Math.round(p.inlineData.data.length * 0.75 / 1024);
          console.log(`✅ Картинка получена за ${elapsed}с (${kb} KB, ${p.inlineData.mimeType})`);
          imageFound = true;
        }
        if (p.text) console.log(`   Текст: ${p.text.slice(0, 100)}`);
      }
    }
    if (!imageFound) console.log(`⚠️ Ответ получен за ${elapsed}с, но картинка не найдена`);
    return { ok: imageFound, elapsed };
  } catch (e) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`❌ Ошибка за ${elapsed}с: ${e.message}`);
    return { ok: false, elapsed };
  }
}

async function main() {
  console.log("🚀 Тестирование мульти-модельной архитектуры");
  console.log(`   GEMINI_API_KEY: ${GEMINI_KEY ? "✅ задан" : "❌ нет"}`);
  console.log(`   GROQ_API_KEY:   ${GROQ_KEY ? "✅ задан" : "❌ нет"}`);

  const kspPrompt = `Составь КСП по математике, 5 класс, тема "Дроби". Верни JSON: {"lessonObjectives": ["..."], "assessmentCriteria": ["..."], "values": "...", "priorKnowledge": "..."}`;
  const enhancePrompt = `Улучши цели урока: 1. "Ученики узнают про дроби" 2. "Ученики решат задачи". Верни JSON: {"items": ["..."]}`;
  const tasksPrompt = `Составь 2 задания для урока "Дроби" 5 класс. Верни JSON: {"tasks": [{"type": "MCQ", "question": "...", "options": ["..."], "correctIndex": 0}]}`;

  const totalStart = Date.now();
  const r1 = await testModel("📝 Генерация КСП", GEMINI_BASE, GEMINI_KEY, "gemini-3.8-flash", kspPrompt);
  const r2 = await testModel("✨ Улучшение секций", GROQ_BASE, GROQ_KEY, "openai/gpt-oss-120b", enhancePrompt);
  const r3 = await testModel("🎮 Интерактивные задания", GROQ_BASE, GROQ_KEY, "qwen/qwen3.8-27b", tasksPrompt);
  const r4 = await testImage();
  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);

  console.log(`\n${"═".repeat(60)}`);
  console.log("📊 ИТОГИ ТЕСТИРОВАНИЯ:");
  console.log(`  📝 Генерация (Gemini 3.8):     ${r1.ok ? "✅" : "❌"} ${r1.elapsed}с`);
  console.log(`  ✨ Улучшение (Groq GPT-120B):   ${r2.ok ? "✅" : "❌"} ${r2.elapsed}с`);
  console.log(`  🎮 Задания (Groq Qwen 3.8):     ${r3.ok ? "✅" : "❌"} ${r3.elapsed}с`);
  console.log(`  🖼️ Картинка (Gemini Image):     ${r4.ok ? "✅" : "❌"} ${r4.elapsed}с`);
  console.log(`  ⏱️ Общее время:                 ${totalElapsed}с`);
  console.log(`${"═".repeat(60)}`);
}

main();
