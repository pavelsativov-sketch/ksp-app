import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
// Выставляются рантаймом, а не владельцем: в .env.example им не место.
const RUNTIME_KEYS = new Set(["NODE_ENV", "VITEST"]);

describe(".env.example", () => {
  it.each(["src/lib/ai/providers.ts", "src/lib/ai/image.ts"])("lists every env key read by %s", (file) => {
    const source = read(file);
    const keys = [...source.matchAll(/process\.env(?:\.([A-Z0-9_]+)|\[\s*["']([A-Z0-9_]+)["']\s*\])/g)]
      .map((m) => m[1] ?? m[2])
      .filter((key) => !RUNTIME_KEYS.has(key));
    expect(keys.length).toBeGreaterThan(0);

    const example = read(".env.example");
    const missing = [...new Set(keys)].filter((key) => !new RegExp(`\\b${key}\\b`).test(example));
    expect(missing).toEqual([]);
  });
});
