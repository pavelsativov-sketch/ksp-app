import OpenAI from "openai";

/**
 * Проверка ключа одного из AI-провайдеров.
 *
 * Ключ берётся из переменной окружения: раньше он был зашит прямо в файл
 * и попал в git вместе с живым значением.
 *
 * Запуск: OPENAI_API_KEY=sk-... node --experimental-strip-types scripts/dev/test-key.ts
 */
const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error("Не задана OPENAI_API_KEY — задайте её в окружении и повторите.");
  process.exit(1);
}

const endpoints = [
  { name: "OpenAI", url: "https://api.openai.com/v1" },
  { name: "DeepSeek", url: "https://api.deepseek.com" },
  { name: "OpenRouter", url: "https://openrouter.ai/api/v1" },
];

async function checkKey() {
  for (const endpoint of endpoints) {
    try {
      const client = new OpenAI({ apiKey: key, baseURL: endpoint.url });
      const res = await client.models.list();
      console.log(`Success with ${endpoint.name}, models: ${res.data.length}`);
      return;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`Failed with ${endpoint.name}: ${message}`);
    }
  }
}

void checkKey();