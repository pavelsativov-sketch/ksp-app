import 'dotenv/config';
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

async function main() {
  console.log("Testing nex-agi/nex-n2.5-pro:free...");
  try {
    const res = await client.chat.completions.create({
      model: "nex-agi/nex-n2.5-pro:free",
      temperature: 0.7,
      max_tokens: 1000,
      messages: [
        { role: "user", content: "Привет! Какие твои основные возможности? Напиши пару предложений на русском." }
      ]
    });
    console.log("Result:", res.choices[0]?.message?.content);
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

main();
