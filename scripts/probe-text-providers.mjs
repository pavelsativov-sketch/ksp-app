import { readFileSync } from "node:fs";
import { resolve } from "node:path";

for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*(GROQ_API_KEY|GEMINI_API_KEY|XAI_API_KEY|GROK_API_KEY)\s*=\s*(.*)\s*$/);
  if (!match) continue;
  const raw = match[2].replace(/^(["'])(.*)\1$/, "$2");
  if (!process.env[match[1]]) process.env[match[1]] = raw;
}

const providers = [
  { name: "Groq", env: ["GROQ_API_KEY"], url: "https://api.groq.com/openai/v1/chat/completions", model: "openai/gpt-oss-20b" },
  { name: "Gemini", env: ["GEMINI_API_KEY"], url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", model: "gemini-3.8-flash" },
  { name: "xAI Grok", env: ["XAI_API_KEY", "GROK_API_KEY"], url: "https://api.x.ai/v1/chat/completions", model: "grok-4.7" },
];

let failed = false;
for (const provider of providers) {
  const keys = [...new Set(provider.env.flatMap((env) => (process.env[env] ?? "").split(",").map((key) => key.trim()).filter(Boolean)))];
  if (keys.length === 0) {
    console.log(`${provider.name}: ключ не настроен`);
    failed = true;
    continue;
  }
  for (const [index, key] of keys.entries()) {
    try {
      const response = await fetch(provider.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: provider.model, messages: [{ role: "user", content: "Ответь цифрой 1." }], max_tokens: 4, temperature: 0 }),
        signal: AbortSignal.timeout(15_000),
      });
      let generated = false;
      if (response.ok) {
        const data = await response.json().catch(() => null);
        generated = typeof data?.choices?.[0]?.message?.content === "string";
      } else {
        await response.body?.cancel().catch(() => {});
      }
      console.log(`${provider.name} key #${index + 1}: HTTP ${response.status}; ${generated ? "model response received" : "no model response"}`);
      if (!response.ok || !generated) failed = true;
    } catch (error) {
      const timeout = error instanceof Error && error.name === "TimeoutError";
      console.log(`${provider.name} key #${index + 1}: ${timeout ? "timeout" : "connection failed"}`);
      failed = true;
    }
  }
}
if (failed) process.exitCode = 1;
