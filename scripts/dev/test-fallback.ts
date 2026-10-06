import "dotenv/config";
import { executeWithFallback } from "./src/lib/ai/providers";

async function test() {
  console.log("Testing generation fallback...");
  try {
    const res = await executeWithFallback("generation", async (client, model, config) => {
      console.log(`[generation] Trying model: ${model} on ${config.baseURL}...`);
      const response = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: "Привет" }]
      });
      return response.choices[0]?.message?.content;
    });
    console.log("SUCCESS generation:", res?.substring(0, 50));
  } catch(e: any) {
    console.error("FAIL generation:", e.message);
  }

  console.log("\nTesting enhance fallback...");
  try {
    const res = await executeWithFallback("enhance", async (client, model, config) => {
      console.log(`[enhance] Trying model: ${model} on ${config.baseURL}...`);
      const response = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: "Привет" }]
      });
      return response.choices[0]?.message?.content;
    });
    console.log("SUCCESS enhance:", res?.substring(0, 50));
  } catch(e: any) {
    console.error("FAIL enhance:", e.message);
  }
}
test();
