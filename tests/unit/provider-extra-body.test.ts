/**
 * Mercury 3 без reasoning_effort "instant" тратил на рассуждения почти весь бюджет
 * ответа, и презентация обрывалась. Проверяем, что поле уходит только к Mercury.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const bodies: Array<{ baseURL: string; body: Record<string, unknown> }> = [];

vi.mock("openai", () => {
  class FakeOpenAI {
    baseURL: string;
    constructor(opts: { baseURL: string }) {
      this.baseURL = opts.baseURL;
    }
    chat = {
      completions: {
        create: async (body: Record<string, unknown>) => {
          bodies.push({ baseURL: this.baseURL, body });
          if (this.baseURL.includes("inceptionlabs")) throw Object.assign(new Error("503 busy"), { status: 503 });
          return { choices: [{ message: { content: "ok" } }] };
        },
      },
    };
  }
  return { default: FakeOpenAI };
});

vi.mock("@/lib/logger", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

beforeEach(() => {
  bodies.length = 0;
  for (const key of ["APINEX_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY", "XAI_API_KEY", "GROK_API_KEY", "CEREBRAS_API_KEY", "OPENROUTER_API_KEY", "MXR_API_KEY", "KENARI_API_KEY"]) process.env[key] = "";
  process.env.MERCURY_API_KEY = "mercury-test";
  process.env.GROQ_API_KEY = "groq-test";
});

describe("extraBody провайдера", () => {
  it("добавляет reasoning_effort только к запросам Mercury", async () => {
    vi.resetModules();
    const { executeWithFallback } = await import("@/lib/ai/providers");
    await executeWithFallback("generation", (client, model) => client.chat.completions.create({ model, messages: [] }));
    const mercury = bodies.find((call) => call.baseURL.includes("inceptionlabs"));
    const groq = bodies.find((call) => call.baseURL.includes("groq"));
    expect(mercury?.body).toMatchObject({ model: "mercury-3", reasoning_effort: "instant" });
    expect(groq?.body).not.toHaveProperty("reasoning_effort");
  });
});
