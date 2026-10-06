import "dotenv/config";
import OpenAI from "openai";
import { buildSystemPrompt, buildUserPrompt, OPENAI_JSON_SCHEMA } from "./src/lib/ai/prompt";

const input = {
  grade: 5,
  subject: "Математика",
  topic: "Сложение дробей",
  language: "ru" as const
};

async function testModel(name: string, client: OpenAI, model: string, format?: any) {
  console.log(`\n--- Testing ${name} (${model}) ---`);
  const t0 = Date.now();
  try {
    const response = await client.chat.completions.create({
      model,
      temperature: 0.7,
      messages: [
        { role: "system", content: buildSystemPrompt(input.language) },
        { role: "user", content: buildUserPrompt(input) },
      ],
      response_format: format,
    });
    const content = response.choices[0]?.message.content || "";
    console.log(`Time: ${Date.now() - t0} ms. Raw length: ${content.length}`);
    const parsed = JSON.parse(content);
    
    let totalLength = 0;
    totalLength += (parsed.stages?.beginning?.teacherActions || "").length;
    totalLength += (parsed.stages?.middle?.teacherActions || "").length;
    totalLength += (parsed.stages?.end?.teacherActions || "").length;
    console.log(`Total teacher actions length: ${totalLength}`);
    console.log("Middle stage actions:", parsed.stages?.middle?.teacherActions?.substring(0, 300) + "...");
  } catch (e: any) {
    console.error("FAIL:", e.message);
  }
}

async function run() {
  const gemini = new OpenAI({ apiKey: process.env.GEMINI_API_KEY, baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/" });
  const groq = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" });

  await testModel("Gemini", gemini, "gemini-3.8-flash", undefined);
  await testModel("Groq 120B", groq, "openai/gpt-oss-120b", { type: "json_object" });
}
run();
