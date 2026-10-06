import { config } from "dotenv";
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
config({ path: ".env.local" });
const tmp = mkdtempSync(join(process.cwd(), ".tmp-image-diagnostic-"));
const nativeFetch = globalThis.fetch;
let sent = 0;
globalThis.fetch = async (url, options) => {
  const request = ++sent;
  const start = Date.now();
  console.log(`SEND ${request}: FLUX.1 schnell (image API)`);
  try {
    const response = await nativeFetch(url, options);
    const info = { request, status: response.status, elapsedMs: Date.now() - start,
      contentType: response.headers.get("content-type"), retryAfter: response.headers.get("retry-after") };
    if (!response.ok) {
      const body = await response.clone().text();
      info.bodyLength = body.length;
      try { info.errorCodes = JSON.parse(body).errors?.map((e) => e.code); } catch { info.nonJsonError = true; }
    }
    console.log("RESPONSE " + JSON.stringify(info));
    return response;
  } catch (error) {
    console.log(`NETWORK ${request}: ${error.name}; code=${error.cause?.code || "none"}`);
    throw error;
  }
};
try {
  const out = join(tmp, "images.mjs");
  await build({ entryPoints: ["src/lib/handouts/images.ts"], outfile: out, bundle: true,
    platform: "node", format: "esm", packages: "external", alias: { "@": join(process.cwd(), "src") } });
  const { illustrateFlashcards } = await import(pathToFileURL(out).href);
  const cards = [
    { front: "Половина яблока", back: "Одна из двух равных частей яблока." },
    { front: "Четверть круга", back: "Одна из четырёх равных частей круга." },
    { front: "Треть пирога", back: "Одна из трёх равных частей пирога." },
    { front: "Три четверти", back: "Три из четырёх равных частей целого." },
  ];
  const result = await illustrateFlashcards(cards, { topic: "Обыкновенные дроби", subject: "Математика", grade: 5, language: "ru" });
  result.items.forEach((card, i) => console.log(`CARD ${i + 1}: ${card.imageBase64 ? "image received" : "MISSING"}`));
  console.log(JSON.stringify({ attempted: result.attempted, created: result.created, httpRequests: sent }));
  process.exitCode = result.created === cards.length ? 0 : 1;
} finally {
  globalThis.fetch = nativeFetch;
  rmSync(tmp, { recursive: true, force: true });
}
