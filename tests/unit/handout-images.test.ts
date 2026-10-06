import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { WorksheetTask } from "@/lib/handouts/types";

// Текстовые AI-провайдеры мокаются: никаких реальных сетевых запросов.
vi.mock("@/lib/ai/providers", () => ({
  isAnyProviderConfigured: vi.fn(),
  getResponseFormat: vi.fn(),
  executeWithFallback: vi.fn(),
}));

const { openaiImages, openaiConstructor } = vi.hoisted(() => ({
  openaiImages: vi.fn(),
  openaiConstructor: vi.fn(),
}));
vi.mock("openai", () => ({
  default: class {
    images = { generate: openaiImages };
    constructor() { openaiConstructor(); }
  },
}));

vi.mock("@/lib/ai/image", () => ({
  generateImage: vi.fn(),
}));

import { generateHandout } from "@/lib/handouts/generate";
import { illustrateFlashcards, illustrateWorksheetTasks } from "@/lib/handouts/images";
import { executeWithFallback, isAnyProviderConfigured as configured } from "@/lib/ai/providers";
import { generateImage } from "@/lib/ai/image";

const { isAnyProviderConfigured, executeWithFallbackMock } = {
  isAnyProviderConfigured: vi.mocked(configured),
  executeWithFallbackMock: vi.mocked(executeWithFallback),
};
const generateImageMock = vi.mocked(generateImage);

const ENV_KEYS = ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "OPENAI_API_KEY"] as const;
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected external request"); }));
  isAnyProviderConfigured.mockReturnValue(true);
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV[key];
    if (value) process.env[key] = value;
    else delete process.env[key];
  }
});

const WORKSHEET_JSON = {
  title: "Рабочий лист",
  intro: "Интро",
  metaLine: "ФИО: ____",
  tasks: [
    { type: "open", prompt: "Что такое дробь? Объясни и приведи пример.", criterion: "К1", descriptor: "Д1", points: 4, expectedAnswer: "Дробь — часть целого, например 1/2 яблока.", imagePromptEn: "A cute apple cut in halves, no text" },
    { type: "fill", prompt: "Дробь 1/2 состоит из числителя _____ и знаменателя.", criterion: "К2", descriptor: "Д2", points: 3, expectedAnswer: "числителя 1 и знаменателя 2", imagePromptEn: null },
    { type: "true_false", prompt: "Дробь 2/4 равна 1/2.", criterion: "К3", descriptor: "Д3", points: 3, correctIndex: 0, imagePromptEn: null },
  ],
};

const baseInput = {
  kind: "worksheet" as const,
  topic: "Дроби",
  subject: "Математика",
  grade: 5,
  language: "ru" as const,
  count: 3,
};

const PROVIDER_CONFIG = { apiKey: "k", baseURL: "b", model: "mock-model", supportsJsonSchema: true, label: "mock" };

/**
 * Новый контракт chatJson: валидация выполняется внутри колбэка executeWithFallback,
 * поэтому мок обязан его вызывать (иначе парсинг не срабатывает вовсе).
 */
function mockProviderReturn(content: string | Error) {
  executeWithFallbackMock.mockImplementation(async (_task, exec) => {
    const client = {
      chat: { completions: { create: async () => {
        if (content instanceof Error) throw content;
        return { choices: [{ message: { content } }] };
      } } },
    };
    return exec(client as never, PROVIDER_CONFIG.model, PROVIDER_CONFIG);
  });
}

describe("generateHandout worksheet: cardLayout / withImages separation", () => {
  it("sends a complete nullable strict schema in the prompt for fallback models", async () => {
    executeWithFallbackMock.mockImplementation(async (_task, exec) => {
      const create = vi.fn(async (request: { messages: Array<{ content: string }> }) => {
        const prompt = request.messages[0].content;
        const schema = JSON.parse(prompt.split("JSON Schema: ")[1]);
        const task = schema.properties.tasks.items;
        expect(task.required.sort()).toEqual(Object.keys(task.properties).sort());
        for (const key of ["options", "pairs", "correctIndex", "expectedAnswer", "groups", "items", "correctFlags", "link", "imagePromptEn"]) {
          expect(task.properties[key].type).toContain("null");
        }
        return { choices: [{ message: { content: JSON.stringify(WORKSHEET_JSON) } }] };
      });
      return exec({ chat: { completions: { create } } } as never, "fallback", { ...PROVIDER_CONFIG, supportsJsonSchema: false });
    });
    const result = await generateHandout(baseInput);
    expect(result.kind).toBe("worksheet");
  });
  it.each([undefined, false])("cardLayout=true withImages=%s не вызывает иллюстрации", async (withImages) => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acc";
    process.env.CLOUDFLARE_API_TOKEN = "tok";
    mockProviderReturn(JSON.stringify(WORKSHEET_JSON));
    const h = await generateHandout({ ...baseInput, cardLayout: true, withImages });
    expect(h.kind).toBe("worksheet");
    if (h.kind !== "worksheet") return;
    expect(h.cardLayout).toBe(true);
    expect(generateImageMock).not.toHaveBeenCalled();
    for (const t of h.tasks) {
      expect(t.imageBase64).toBeUndefined();
      expect(t.imageMime).toBeUndefined();
    }
  });

  it("withImages=true вызывает illustrateWorksheetTasks (карточный режим включён)", async () => {
    mockProviderReturn(JSON.stringify(WORKSHEET_JSON));
    process.env.CLOUDFLARE_ACCOUNT_ID = "acc";
    process.env.CLOUDFLARE_API_TOKEN = "tok";
    generateImageMock.mockResolvedValue({ base64: "IMG", mimeType: "image/jpeg", provider: "Cloudflare FLUX.1", model: "flux-1-schnell" });

    const h = await generateHandout({ ...baseInput, withImages: true });
    if (h.kind !== "worksheet") throw new Error("expected worksheet");
    expect(h.cardLayout).toBe(true);
    // Иллюстрируется только задание с imagePromptEn (первое) — остальные без картинок.
    expect(generateImageMock).toHaveBeenCalledTimes(1);
    expect(h.tasks[0]?.imageBase64).toBe("IMG");
    expect(h.tasks[0]?.imageMime).toBe("image/jpeg");
    expect(h.tasks[1]?.imageBase64).toBeUndefined();
    expect(h.tasks[2]?.imageBase64).toBeUndefined();
  });

  it("ни cardLayout, ни withImages — обычный лист без карточек и картинок", async () => {
    mockProviderReturn(JSON.stringify(WORKSHEET_JSON));
    const h = await generateHandout({ ...baseInput });
    if (h.kind !== "worksheet") throw new Error("expected worksheet");
    expect(h.cardLayout).toBeUndefined();
    expect(generateImageMock).not.toHaveBeenCalled();
  });

  it("битый ответ провайдера отклоняется валидацией и переключает на следующего", async () => {
    let calls = 0;
    // Мок воспроизводит семантику фоллбэка: ошибка внутри колбэка (включая
    // отказ валидации) → попытка повторяется у следующего «провайдера».
    executeWithFallbackMock.mockImplementation(async (_task, exec) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        calls++;
        const client = {
          chat: { completions: { create: async () => ({
            choices: [{ message: { content: attempt === 0 ? "не JSON вообще" : JSON.stringify(WORKSHEET_JSON) } }],
          }) } },
        };
        try {
          return await exec(client as never, PROVIDER_CONFIG.model, PROVIDER_CONFIG);
        } catch {
          // первый «провайдер» дал невалидный ответ — фоллбэк на второго
        }
      }
      throw new Error("Все провайдеры недоступны");
    });

    const h = await generateHandout({ ...baseInput });
    if (h.kind !== "worksheet") throw new Error("expected worksheet");
    expect(calls).toBe(2); // первая попытка отклонена валидацией, вторая успешна
    expect(h.tasks).toHaveLength(3);
    for (const t of h.tasks) {
      expect(t.criterion).toBeTruthy();
      expect(t.descriptor).toBeTruthy();
    }
  });

  it("структурно неверный ответ (match без пар) не доходит до рендера", async () => {
    const broken = { ...WORKSHEET_JSON, tasks: [...WORKSHEET_JSON.tasks.slice(0, 2), { type: "match", prompt: "Сопоставь", criterion: "К", descriptor: "Д", points: 4 }] };
    mockProviderReturn(JSON.stringify(broken));

    // Контракт: сломанный ответ модели никогда не рендерится. Если AI
    // недоступен или вернул мусор, учитель получает валидный лист от
    // локального методического конструктора с флагом degraded.
    const h = await generateHandout({ ...baseInput });
    if (h.kind !== "worksheet") throw new Error("expected worksheet");

    expect(h.degraded).toBe(true);
    for (const t of h.tasks) {
      if (t.type === "match") {
        // пары обязательны — «match без пар» не должен просочиться
        expect(t.options?.length ?? 0).toBeGreaterThanOrEqual(2);
        expect(t.pairs).toHaveLength(t.options?.length ?? 0);
      }
      expect(t.criterion).toBeTruthy();
      expect(t.descriptor).toBeTruthy();
    }
  });
});

/** Резерв квоты изображений по умолчанию: слот есть всегда. */
const allow = async () => ({ ok: true, finalize: async () => {} });

describe("illustrateWorksheetTasks", () => {
  const ctx = { topic: "Дроби", subject: "Математика", grade: 5 };

  function makeTasks(n: number): WorksheetTask[] {
    return Array.from({ length: n }, (_, i) => ({
      type: "open" as const,
      prompt: `Задание ${i + 1}`,
      criterion: `К${i + 1}`,
      descriptor: `Д${i + 1}`,
      points: 1,
      imagePromptEn: `Illustration for task ${i + 1}, no text`,
    }));
  }

  it("без конфига Cloudflare возвращает задания без изменений и не делает запросов", async () => {
    // Без imagePromptEn ни одно задание иллюстрации не просит.
    const tasks: WorksheetTask[] = makeTasks(3);
    for (const t of tasks) delete t.imagePromptEn;
    const { items, attempted, created } = await illustrateWorksheetTasks(tasks, ctx, allow);
    expect(generateImageMock).not.toHaveBeenCalled();
    expect(attempted).toBe(0);
    expect(created).toBe(0);
    expect(items).toEqual(tasks);
  });

  it("успех: каждое задание получает иллюстрацию и результат содержит счётчики", async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acc";
    process.env.CLOUDFLARE_API_TOKEN = "tok";
    generateImageMock.mockResolvedValue({ base64: "B64", mimeType: "image/jpeg", provider: "x", model: "mock" });

    const { items, attempted, created } = await illustrateWorksheetTasks(makeTasks(3), ctx, allow);
    expect(generateImageMock).toHaveBeenCalledTimes(3);
    expect(attempted).toBe(3);
    expect(created).toBe(3);
    for (const t of items) {
      expect(t.imageBase64).toBe("B64");
      expect(t.imageAlt).toBe(t.prompt.slice(0, 120));
    }
  });

  it("частичные ошибки: неудачные задания остаются без картинки, created отражает успехи", async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acc";
    process.env.CLOUDFLARE_API_TOKEN = "tok";
    generateImageMock.mockImplementation(async ({ prompt }) => {
      if (/task 2/i.test(prompt)) throw new Error("boom");
      return { base64: "OK", mimeType: "image/jpeg", provider: "x", model: "mock" };
    });

    const { items, attempted, created } = await illustrateWorksheetTasks(makeTasks(3), ctx, allow);
    expect(attempted).toBe(3);
    expect(created).toBe(2);
    expect(items[0]?.imageBase64).toBe("OK");
    expect(items[1]?.imageBase64).toBeUndefined();
    expect(items[2]?.imageBase64).toBe("OK");
  });

  it("полный провал провайдера: attempted>0, created=0 — срабатывает imagesFailed-контракт", async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acc";
    process.env.CLOUDFLARE_API_TOKEN = "tok";
    generateImageMock.mockRejectedValue(new Error("boom"));
    const { attempted, created } = await illustrateWorksheetTasks(makeTasks(4), ctx, allow);
    expect(attempted).toBe(4);
    expect(created).toBe(0);
  });

  it("порядок и исходные поля сохраняются (исходный массив не мутируется)", async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acc";
    process.env.CLOUDFLARE_API_TOKEN = "tok";
    generateImageMock.mockImplementation(async ({ prompt }) => {
      const n = Number(prompt.match(/task (\d+)/i)?.[1] ?? 0);
      // Finish later tasks first to exercise indexed result ordering.
      await new Promise((resolve) => setTimeout(resolve, (6 - n) * 5));
      return { base64: `IMG-${n}`, mimeType: "image/jpeg", provider: "x", model: "mock" };
    });

    const tasks = makeTasks(5);
    const snapshot = JSON.parse(JSON.stringify(tasks));
    const { items } = await illustrateWorksheetTasks(tasks, ctx, allow);

    expect(items).toHaveLength(5);
    items.forEach((t, i) => {
      expect(t.prompt).toBe(`Задание ${i + 1}`);
      expect(t.criterion).toBe(`К${i + 1}`);
      expect(t.descriptor).toBe(`Д${i + 1}`);
      expect(t.imageBase64).toBe(`IMG-${i + 1}`);
    });
    expect(tasks).toEqual(snapshot);
  });

  it("параллельность не превышает 3 одновременных запросов", async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acc";
    process.env.CLOUDFLARE_API_TOKEN = "tok";
    let inFlight = 0;
    let maxInFlight = 0;
    generateImageMock.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 15));
      inFlight--;
      return { base64: "IMG", mimeType: "image/jpeg", provider: "x", model: "mock" };
    });

    await illustrateWorksheetTasks(makeTasks(10), ctx, allow);
    expect(generateImageMock).toHaveBeenCalledTimes(10);
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(maxInFlight).toBeGreaterThan(1); // действительно идёт параллельно
  });

  // Регрессия: квота изображений обходилась вызовом /api/handouts/* с
  // withImages — слот резервировался только в /api/ai/image.
  it("квота резервируется ДО каждого вызова провайдера", async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acc";
    process.env.CLOUDFLARE_API_TOKEN = "tok";
    generateImageMock.mockResolvedValue({ base64: "OK", mimeType: "image/jpeg", provider: "x", model: "mock" });
    const order: string[] = [];
    let reserved = 0;
    const reserve = async () => {
      reserved++;
      order.push("reserve");
      return { ok: true, finalize: async () => { order.push("finalize"); } };
    };

    const { created } = await illustrateWorksheetTasks(makeTasks(3), ctx, reserve);
    expect(reserved).toBe(3);
    expect(created).toBe(3);
    // Резерв до запроса к Cloudflare, финализация после успеха.
    expect(order[0]).toBe("reserve");
  });

  it("исчерпанная квота останавливает генерацию: лишних запросов к провайдеру нет", async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acc";
    process.env.CLOUDFLARE_API_TOKEN = "tok";
    generateImageMock.mockResolvedValue({ base64: "OK", mimeType: "image/jpeg", provider: "x", model: "mock" });
    let remaining = 2;
    const onlyTwo = async () => {
      if (remaining <= 0) return { ok: false as const };
      remaining--;
      return { ok: true as const, finalize: async () => {} };
    };

    const { items, created, quotaExhausted } = await illustrateWorksheetTasks(makeTasks(6), ctx, onlyTwo);
    // Инвариант, ради которого всё затевалось: после исчерпания квоты
    // дополнительных платных запросов к Cloudflare не уходит.
    expect(remaining).toBe(0);
    expect(generateImageMock).toHaveBeenCalledTimes(2);
    expect(created).toBe(2);
    expect(quotaExhausted).toBe(true);
    // Материал остаётся пригодным: задания без картинок просто остаются.
    expect(items).toHaveLength(6);
    expect(items.every((t) => "prompt" in t)).toBe(true);
  });

  it("сбой провайдера возвращает слот квоты, чтобы не списывать впустую", async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acc";
    process.env.CLOUDFLARE_API_TOKEN = "tok";
    generateImageMock.mockRejectedValue(new Error("boom"));
    let finalizedFalse = 0;
    const reserve = async () => ({
      ok: true,
      finalize: async (success: boolean) => { if (!success) finalizedFalse++; },
    });

    await illustrateWorksheetTasks(makeTasks(2), ctx, reserve);
    expect(finalizedFalse).toBe(2);
  });

  it("без ключей Cloudflare квота не расходуется впустую", async () => {
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
    const { attempted, created } = await illustrateWorksheetTasks(makeTasks(3), ctx, async () => {
      throw new Error("квота не должна резервироваться");
    });
    expect(attempted).toBe(0);
    expect(created).toBe(0);
  });
});

describe("illustrateFlashcards через общий Cloudflare-провайдер", () => {
  it("карточки используют generateImage (тот же путь, что лист и картинки к уроку)", async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acc";
    process.env.CLOUDFLARE_API_TOKEN = "tok";
    generateImageMock.mockResolvedValue({ base64: "JPG", mimeType: "image/jpeg", provider: "Cloudflare FLUX.1", model: "flux-1-schnell" });
    const cards = [{ front: "Дробь", back: "Часть целого" }];
    const { items, attempted, created } = await illustrateFlashcards(cards, { ...baseInput, language: "ru" }, allow);
    expect(generateImageMock).toHaveBeenCalledTimes(1);
    expect(attempted).toBe(1);
    expect(created).toBe(1);
    expect(items[0]).toEqual({ ...cards[0], imageBase64: "JPG", imageMime: "image/jpeg", imageAlt: "Дробь" });
    expect(cards[0]).not.toHaveProperty("imageBase64");
  });

  it("OpenAI-путь больше не используется: без Cloudflare-ключей запросов нет даже с OPENAI_API_KEY", async () => {
    process.env.OPENAI_API_KEY = "test";
    const { attempted, created } = await illustrateFlashcards([{ front: "A", back: "B" }], { ...baseInput, language: "ru" }, allow);
    expect(openaiImages).not.toHaveBeenCalled();
    expect(attempted).toBe(0);
    expect(created).toBe(0);
  });
});

describe("generateHandout stub branch (без ключей)", () => {
  it("stub worksheet с cardLayout/withImages не делает внешних вызовов", async () => {
    isAnyProviderConfigured.mockReturnValue(false);
    const h = await generateHandout({ ...baseInput, count: 4, cardLayout: true, withImages: true });
    expect(h.kind).toBe("worksheet");
    if (h.kind !== "worksheet") return;
    expect(h.stub).toBe(true);
    expect(h.cardLayout).toBe(true);
    expect(generateImageMock).not.toHaveBeenCalled();
    expect(executeWithFallbackMock).not.toHaveBeenCalled();
  });
});
