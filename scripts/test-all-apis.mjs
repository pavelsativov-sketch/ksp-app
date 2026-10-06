import { config } from "dotenv";
config({ path: ".env.local", override: true });

const BASE = "http://localhost:3000";

async function timedFetch(label, url, body) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`🔄 ${label}...`);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const data = await res.json();
    if (!res.ok) {
      console.log(`❌ ${label}: HTTP ${res.status} за ${elapsed}с`);
      console.log(`   Ошибка: ${data.error || JSON.stringify(data).slice(0, 200)}`);
      return { ok: false, elapsed };
    }
    console.log(`✅ ${label}: HTTP ${res.status} за ${elapsed}с`);
    return { ok: true, data, elapsed };
  } catch (e) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`❌ ${label}: ОШИБКА за ${elapsed}с — ${e.message}`);
    return { ok: false, elapsed };
  }
}

async function testGeneration() {
  const result = await timedFetch(
    "📝 Генерация КСП (Gemini 3.8 Flash)",
    `${BASE}/api/ai/generate`,
    {
      grade: 5,
      subject: "Математика",
      topic: "Дроби. Сложение и вычитание дробей",
      learningObjectives: ["5.1.2.4 складывать дроби"],
      language: "ru",
    },
  );
  if (result.ok) {
    const c = result.data.content;
    console.log(`   Тема: ${c.topic}`);
    console.log(`   Цели: ${c.lessonObjectives?.length || 0} шт`);
  }
  return result;
}

async function testEnhance() {
  const result = await timedFetch(
    "✨ Улучшение секции (Groq GPT OSS 120B)",
    `${BASE}/api/ai/enhance`,
    {
      section: "lessonObjectives",
      current: ["Ученики узнают про дроби"],
      context: { topic: "Дроби", subject: "Математика", grade: 5, language: "ru" },
    },
  );
  if (result.ok) {
    const items = Array.isArray(result.data.improved) ? result.data.improved : [result.data.improved];
    console.log(`   Улучшено ${items.length} пунктов.`);
  }
  return result;
}

async function testTasks() {
  const result = await timedFetch(
    "🎮 Интерактивные задания (Groq GPT OSS 20B)",
    `${BASE}/api/ai/generate-tasks`,
    {
      topic: "Дроби",
      subject: "Математика",
      grade: 5,
      stage: "middle",
      language: "ru",
      count: 2,
    },
  );
  if (result.ok) {
    console.log(`   Сгенерировано ${result.data.tasks?.length || 0} заданий.`);
  }
  return result;
}

async function testImage() {
  const result = await timedFetch(
    "🖼️ Генерация картинки (Cloudflare FLUX.1)",
    `${BASE}/api/ai/image`,
    {
      prompt: "Number line with fractions for math lesson",
      topic: "Fractions",
      subject: "Math",
      grade: 5,
    },
  );
  if (result.ok) {
    const img = result.data.image;
    console.log(`   Картинка получена: ${Math.round(img.length * 0.75 / 1024)} KB`);
    console.log(`   Провайдер: ${result.data.provider}`);
  }
  return result;
}

async function main() {
  console.log("🚀 Тестирование всех API (полный стек)");
  
  // Checking auth context - normally /api requires auth if mongo is connected
  // Wait, the API routes use `requireApiAuth` which falls back to Demo user if no token!
  // So it should work locally without a cookie.
  
  const totalStart = Date.now();
  
  const r1 = await testGeneration();
  const r2 = await testEnhance();
  const r3 = await testTasks();
  const r4 = await testImage();

  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);

  console.log(`\n${"═".repeat(60)}`);
  console.log("📊 ИТОГИ:");
  console.log(`   Генерация КСП:   ${r1.ok ? "✅" : "❌"} ${r1.elapsed}с`);
  console.log(`   Улучшение:       ${r2.ok ? "✅" : "❌"} ${r2.elapsed}с`);
  console.log(`   Задания:         ${r3.ok ? "✅" : "❌"} ${r3.elapsed}с`);
  console.log(`   Картинка (CF):   ${r4.ok ? "✅" : "❌"} ${r4.elapsed}с`);
  console.log(`   Общее время:     ${totalElapsed}с`);
  console.log(`${"═".repeat(60)}`);
}

main();
