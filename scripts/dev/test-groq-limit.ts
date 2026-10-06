import "dotenv/config";
import OpenAI from "openai";

async function testGroqLimit(model: string) {
  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1"
  });
  
  console.log(`Testing Groq ${model} for large output...`);
  try {
    const t0 = Date.now();
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "user", content: "Write a very long essay about the history of mathematics, at least 1500 words." }
      ],
      max_tokens: 3000
    });
    console.log(`Success! Length: ${response.choices[0]?.message.content?.length} chars. Time: ${Date.now() - t0}ms`);
  } catch (e: any) {
    console.error(`Failed on ${model}:`, e.message);
  }
}

async function main() {
  await testGroqLimit("openai/gpt-oss-120b");
  await testGroqLimit("qwen/qwen3.8-27b");
}
main();
