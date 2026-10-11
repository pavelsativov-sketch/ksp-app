/**
 * Переключение запасных ключей.
 *
 * Проверяется ровно то, что ломалось: первый ключ провайдера может быть
 * исчерпан (Gemini отдаёт 429 «exceeded your current quota»), второй —
 * рабочий. Раньше каскад считал провайдера мёртвым и падал, хотя резерв был
 * под рукой.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Клиент OpenAI-мока: помнит, каким ключом к нему обращались. */
const calls: Array<{ apiKey: string; model: string }> = [];
/** Что отвечать: по ключу — ответ или ошибка. */
let behaviour: Record<string, () => Promise<{ choices: Array<{ message: { content: string } }> }>> = {};

vi.mock("openai", () => {
  class FakeOpenAI {
    apiKey: string;
    baseURL: string;
    constructor(opts: { apiKey: string; baseURL: string }) {
      this.apiKey = opts.apiKey;
      this.baseURL = opts.baseURL;
    }
    chat = {
      completions: {
        create: async ({ model }: { model: string }) => {
          calls.push({ apiKey: this.apiKey, model });
          const reply = behaviour[this.apiKey];
          if (!reply) {
            const err = new Error("401 Incorrect API key") as Error & { status: number };
            err.status = 401;
            throw err;
          }
          return reply();
        },
      },
    };
  }
  return { default: FakeOpenAI };
});

vi.mock("@/lib/logger", () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const ok = (text: string) => async () => ({ choices: [{ message: { content: text } }] });
const quotaExceeded = () => {
  const err = new Error("You exceeded your current quota") as Error & { status: number };
  err.status = 429;
  throw err;
};

async function loadProviders() {
  vi.resetModules();
  return import("@/lib/ai/providers");
}

beforeEach(() => {
  calls.length = 0;
  behaviour = {};
  process.env.GEMINI_API_KEY = "";
  process.env.GROQ_API_KEY = "";
  process.env.OPENAI_API_KEY = "";
  process.env.CEREBRAS_API_KEY = "";
  process.env.OPENROUTER_API_KEY = "";
  process.env.ANTHROPIC_API_KEY = "";
});

describe("разбор ключей из переменной окружения", () => {
  it("ключи перечисляются через запятую", async () => {
    const { parseApiKeys } = await loadProviders();
    expect(parseApiKeys("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("пробелы и пустые места не становятся ключами", async () => {
    // Лишний пробел после запятой дал бы ключ « b», который не работает.
    const { parseApiKeys } = await loadProviders();
    expect(parseApiKeys(" a , b ,, c ")).toEqual(["a", "b", "c"]);
  });

  it("пустая переменная — это ноль ключей, а не один пустой", async () => {
    const { parseApiKeys } = await loadProviders();
    // Пустой ключ прошёл бы проверку «есть ли apiKey» и занял бы попытку.
    expect(parseApiKeys("")).toEqual([]);
    expect(parseApiKeys(undefined)).toEqual([]);
  });
});

describe("переключение ключей", () => {
  it("задача агента начинает с проверенного быстрого Groq tool-call", async () => {
    const { executeWithFallback } = await loadProviders();
    process.env.GEMINI_API_KEY = "slow-gemini";
    process.env.GROQ_API_KEY = "working-groq";
    behaviour = { "working-groq": ok("tool call ready"), "slow-gemini": ok("late") };

    const result = await executeWithFallback("tasks", async (client, model) => {
      const response = await client.chat.completions.create({ model, messages: [] });
      return response.choices[0]?.message?.content ?? "";
    });

    expect(result).toBe("tool call ready");
    expect(calls).toEqual([{ apiKey: "working-groq", model: "openai/gpt-oss-120b" }]);
  });

  it("исчерпанный первый ключ не роняет задачу: работает второй", async () => {
    const { executeWithFallback } = await loadProviders();
    process.env.GEMINI_API_KEY = "dead-key,live-key";
    behaviour = { "dead-key": quotaExceeded, "live-key": ok("ответ со второго ключа") };

    const result = await executeWithFallback("enhance", async (client, model) => {
      const r = await client.chat.completions.create({ model, messages: [] });
      return r.choices[0]?.message?.content ?? "";
    });

    expect(result).toBe("ответ со второго ключа");
    expect(calls.map((c) => c.apiKey)).toEqual(["dead-key", "live-key"]);
  });

  it("провайдер без ключей не тронут", async () => {
    const { executeWithFallback } = await loadProviders();
    // Groq пуст — каскад обязан пропустить его молча, а не слать запрос.
    process.env.GEMINI_API_KEY = "live";
    behaviour = { live: ok("готово") };

    await executeWithFallback("enhance", async (client, model) => {
      const r = await client.chat.completions.create({ model, messages: [] });
      return r.choices[0]?.message?.content ?? "";
    });
    expect(calls.every((c) => c.apiKey === "live")).toBe(true);
  });

  it("ошибка не про лимит не тратит резервный ключ", async () => {
    // Если первый ключ ответил «модель недоступна», второй того же провайдера
    // не поможет: тратить на него время незачем.
    const { executeWithFallback } = await loadProviders();
    process.env.GEMINI_API_KEY = "bad-model-key,second-key";
    behaviour = {
      "bad-model-key": async () => {
        const err = new Error("model not found") as Error & { status: number };
        err.status = 404;
        throw err;
      },
    };

    await expect(
      executeWithFallback("enhance", async (client, model) => {
        const r = await client.chat.completions.create({ model, messages: [] });
        return r.choices[0]?.message?.content ?? "";
      }),
    ).rejects.toThrow();
    expect(calls.map((c) => c.apiKey)).toEqual(["bad-model-key"]);
  });

  it("исчерпаны все ключи — падает с внятной ошибкой", async () => {
    const { executeWithFallback } = await loadProviders();
    process.env.GEMINI_API_KEY = "dead-1,dead-2";
    behaviour = { "dead-1": quotaExceeded, "dead-2": quotaExceeded };

    await expect(
      executeWithFallback("enhance", async (client, model) => {
        const r = await client.chat.completions.create({ model, messages: [] });
        return r.choices[0]?.message?.content ?? "";
      }),
    ).rejects.toThrow(/недоступны/i);
    expect(calls).toHaveLength(2);
  });

  it("в конфиг попадает ключ, которым реально ответили", async () => {
    // От этого зависит подсказка про восстановление ключа и текст ошибки.
    const { executeWithFallback } = await loadProviders();
    process.env.GEMINI_API_KEY = "dead-key,live-key";
    behaviour = { "dead-key": quotaExceeded, "live-key": ok("ок") };

    const seen: string[] = [];
    await executeWithFallback("enhance", async (_client, _model, config) => {
      seen.push(config.apiKey);
      return "ok";
    });
    expect(seen).toEqual(["dead-key"]);
  });
});

describe("наличие ключей", () => {
  it("список ключей считается настроенным провайдером", async () => {
    const { isAnyProviderConfigured } = await loadProviders();
    process.env.GEMINI_API_KEY = "";
    expect(isAnyProviderConfigured()).toBe(false);
    process.env.GEMINI_API_KEY = "one-key";
    expect(isAnyProviderConfigured()).toBe(true);
  });
});
