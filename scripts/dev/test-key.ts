import OpenAI from "openai";

async function checkKey() {
  const keys = [
    { name: "OpenAI", url: "https://api.openai.com/v1" },
    { name: "DeepSeek", url: "https://api.deepseek.com" },
    { name: "OpenRouter", url: "https://openrouter.ai/api/v1" }
  ];

  for (const k of keys) {
    try {
      const client = new OpenAI({ apiKey: "sk_ba1ce2cd9b48cb38c0b8f1b0275bd49a463c9d06ad85b0a994d5f4444706e88b", baseURL: k.url });
      const res = await client.models.list();
      console.log(`Success with ${k.name}, models: ${res.data.length}`);
      return;
    } catch (e: any) {
      console.log(`Failed with ${k.name}: ${e.message}`);
    }
  }
}
checkKey();
