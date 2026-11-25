import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateImage,
  resetImageCache,
  resetImageFailures,
  cooledDownProviders,
  isImageProviderConfigured,
} from "@/lib/ai/image";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "test-account");
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "secret-test-token");
  // Явно гасим остальные провайдеры: .env.local подхватывается vitest, и
  // реальный GEMINI_API_KEY увёл бы тест не туда.
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("POLLINATIONS_ENABLED", "");
  vi.stubEnv("AI_DISABLE_FREE_PROVIDERS", "");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  // Все тесты берут один промпт: без сброса кеша второй тест получил бы
  // результат первого и не увидел бы ни одного запроса к провайдеру.
  resetImageCache();
  // И состояние отказов: пауза в 10 минут иначе протекла бы из одного теста
  // в другой, потому что часы подменены.
  resetImageFailures();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

/**
 * Сколько запросов ушло конкретной модели.
 *
 * Раньше считалось общее число вызовов fetch. С появлением резервного
 * FLUX.1 schnell отказ FLUX.2 приводит к двум запросам, и проверка «401 не
 * повторяется» ломалась, хотя повторов внутри провайдера не было. Считаем по
 * модели — это и точнее, и сохраняет исходный смысл проверки.
 */
function callsTo(model: string): number {
  return fetchMock.mock.calls.filter((call) => String(call[0]).includes(model)).length;
}

const FLUX2 = "flux-2-dev";
const FLUX_SCHNELL = "flux-1-schnell";
/**
 * Валидная «картинка» для мока: PNG-сигнатура + заполнитель до 1 КБ.
 *
 * Раньше подставляли строку "image-base64", но generateImage проверяет
 * сигнатуру и размер файла, поэтому такой ответ отбраковывался и тест
 * проверял уже не тот код.
 */
const PNG_BYTES = (() => {
  const buf = Buffer.alloc(1024, 0x20);
  buf.writeUInt8(0x89, 0);
  buf.writeUInt8(0x50, 1);
  buf.writeUInt8(0x4e, 2);
  buf.writeUInt8(0x47, 3);
  return buf.toString("base64");
})();
const success = () => Response.json({ result: { image: PNG_BYTES } });

/**
 * FLUX.1 schnell первый и без повторов; повторы с паузой есть у FLUX.2. Чтобы проверить их,
 * schnell в этих тестах недоступен (400), а ответы FLUX.2 идут из очереди.
 */
function flux2Responses(...responses: Array<() => Response>) {
  const queue = [...responses];
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).includes(FLUX_SCHNELL)) return Response.json({ errors: [{ code: 5006, message: "down" }] }, { status: 400 });
    return (queue.length > 1 ? queue.shift()! : queue[0]!)();
  });
}

describe("Cloudflare image requests", () => {
  it("returns a successful image without retrying", async () => {
    fetchMock.mockResolvedValue(success());
    expect((await generateImage({ prompt: "Apple" })).base64).toBe(PNG_BYTES);
    expect(callsTo(FLUX_SCHNELL)).toBe(1);
    expect(callsTo(FLUX2)).toBe(0);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it.each([429, 500, 503])("FLUX.2 does not retry a transient HTTP %s: the cascade is the retry", async (status) => {
    flux2Responses(() => new Response("Temporary", { status, headers: { "Retry-After": "1" } }));
    await expect(generateImage({ prompt: "Apple" })).rejects.toThrow(`Cloudflare API error ${status}`);
    expect(callsTo(FLUX2)).toBe(1);
  });
  it("does not retry or expose an authentication error body", async () => {
    fetchMock.mockResolvedValue(new Response("secret-test-token", { status: 401 }));
    await expect(generateImage({ prompt: "Apple" })).rejects.toThrow("Cloudflare API error 401");
    expect(callsTo(FLUX2)).toBe(1);
    expect(callsTo(FLUX_SCHNELL)).toBe(1);
  });
  it("does not retry a 400 and surfaces sanitized provider error codes", async () => {
    flux2Responses(() => Response.json({ errors: [{ code: 7001, message: "prompt validation failed" }] }, { status: 400 }));
    await expect(generateImage({ prompt: "Apple" })).rejects.toThrow("Cloudflare API error 400 [7001: prompt validation failed]");
    expect(callsTo(FLUX2)).toBe(1);
  });
  it("skips the next provider when the 50 s cascade deadline is nearly spent", async () => {
    fetchMock.mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 46_000);
      return new Response("busy", { status: 503 });
    });
    await expect(generateImage({ prompt: "Apple" })).rejects.toThrow("FLUX.2: пропущен, не осталось времени");
    expect(callsTo(FLUX_SCHNELL)).toBe(1);
    expect(callsTo(FLUX2)).toBe(0);
  });
  it("uses DALL-E when only OPENAI_API_KEY is set, once, without retries", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    fetchMock.mockResolvedValue(new Response("busy", { status: 503 }));
    await expect(generateImage({ prompt: "Apple" })).rejects.toThrow("OpenAI DALL-E error 503");
    expect(callsTo("api.openai.com")).toBe(1);
  });
  it("never calls Gemini, even with GEMINI_API_KEY set", async () => {
    vi.stubEnv("GEMINI_API_KEY", "gemini-key");
    fetchMock.mockResolvedValue(success());
    await generateImage({ prompt: "Apple" });
    expect(callsTo("generativelanguage")).toBe(0);
  });
});

describe("ротация провайдеров", () => {
  /**
   * Провайдеры ждут `Retry-After` через setTimeout, а часы в тестах
   * подменены. Без прокрутки таймеров промис никогда не разрешится и тест
   * падает по таймауту, а не по существу.
   */
  async function generateWithTimers(input: { prompt: string }) {
    const promise = generateImage(input);
    await vi.runAllTimersAsync();
    return promise;
  }

  it("при отказе дешёвого FLUX.1 schnell берёт картинку у резервного FLUX.2", async () => {
    // Schnell первый: FLUX.2 съедал суточный бесплатный лимит Cloudflare за десятки картинок.
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes(FLUX_SCHNELL)
        ? new Response("busy", { status: 503 })
        : success(),
    );
    const result = await generateWithTimers({ prompt: "Apple" });
    expect(result.model).toBe("FLUX.2 [dev]");
    expect(result.base64).toBe(PNG_BYTES);
    expect(callsTo(FLUX2)).toBe(1);
  });

  it("FLUX.1 schnell получает JSON без width/height: модель их не принимает", async () => {
    // Проверено живым запросом: с width/height Cloudflare отвечает 5006,
    // с multipart — 6003. Ошибка стоила бы всех иллюстраций.
    fetchMock.mockResolvedValue(success());
    await generateWithTimers({ prompt: "Apple" });
    const schnellCall = fetchMock.mock.calls.find((call) => String(call[0]).includes(FLUX_SCHNELL));
    expect(schnellCall).toBeTruthy();
    const init = schnellCall![1] as RequestInit;
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    const body = JSON.parse(String(init.body));
    expect(body.width).toBeUndefined();
    expect(body.height).toBeUndefined();
    // num_steps модель отвергает с 400 (5006), из-за этого schnell не работал вовсе.
    expect(body.num_steps).toBeUndefined();
    expect(body.prompt).toBeTruthy();
  });

  it("провайдер, дважды ответивший отказом, выводится из ротации", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes(FLUX_SCHNELL) ? new Response("overloaded", { status: 503 }) : success(),
    );
    // Первый отказ — ещё норма: провайдера не выводим.
    await generateWithTimers({ prompt: "Первая" });
    expect(cooledDownProviders()).not.toContain("FLUX.1 schnell");

    await generateWithTimers({ prompt: "Вторая" });
    expect(cooledDownProviders()).toContain("FLUX.1 schnell");
    expect(callsTo(FLUX_SCHNELL)).toBe(2);

    // Третий вызов идёт сразу в рабочий провайдер, минуя schnell.
    const callsBefore = fetchMock.mock.calls.length;
    await generateWithTimers({ prompt: "Третья" });
    expect(callsTo(FLUX_SCHNELL)).toBe(2);
    expect(fetchMock.mock.calls.length - callsBefore).toBe(1);
  });

  it("после успеха провайдер возвращается в ротацию", async () => {
    let fail = true;
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes(FLUX_SCHNELL) && fail ? new Response("overloaded", { status: 503 }) : success(),
    );
    await generateWithTimers({ prompt: "Раз" });
    fail = false;
    await generateWithTimers({ prompt: "Два" });
    fail = true;
    await generateWithTimers({ prompt: "Три" });
    // Счётчик сброшен успехом: один отказ после него паузы не даёт.
    expect(cooledDownProviders()).not.toContain("FLUX.1 schnell");
  });
});

describe("Pollinations и наличие провайдера", () => {
  const POLLINATIONS = "image.pollinations.ai";
  const pngResponse = () =>
    new Response(Buffer.from(PNG_BYTES, "base64"), { headers: { "content-type": "image/png" } });

  it("Pollinations — последний резерв после отказа Cloudflare", async () => {
    vi.stubEnv("POLLINATIONS_ENABLED", "1");
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes(POLLINATIONS) ? pngResponse() : new Response("limit", { status: 429 }),
    );
    const result = await generateImage({ prompt: "Apple" });
    expect(result.provider).toBe("Pollinations");
    expect(callsTo(FLUX_SCHNELL)).toBe(1);
    expect(callsTo(FLUX2)).toBe(1);
    expect(callsTo(POLLINATIONS)).toBe(1);
  });

  it("AI_DISABLE_FREE_PROVIDERS убирает Pollinations из каскада", async () => {
    vi.stubEnv("POLLINATIONS_ENABLED", "1");
    vi.stubEnv("AI_DISABLE_FREE_PROVIDERS", "1");
    fetchMock.mockResolvedValue(new Response("limit", { status: 429 }));
    await expect(generateImage({ prompt: "Apple" })).rejects.toThrow("Cloudflare");
    expect(callsTo(POLLINATIONS)).toBe(0);
  });

  it("isImageProviderConfigured видит Cloudflare, OpenAI и Pollinations, но не Gemini", () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
    vi.stubEnv("GEMINI_API_KEY", "gemini-key");
    expect(isImageProviderConfigured()).toBe(false);
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    expect(isImageProviderConfigured()).toBe(true);
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("POLLINATIONS_ENABLED", "1");
    expect(isImageProviderConfigured()).toBe(true);
    vi.stubEnv("AI_DISABLE_FREE_PROVIDERS", "true");
    expect(isImageProviderConfigured()).toBe(false);
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acc");
    expect(isImageProviderConfigured()).toBe(true);
  });
});

describe("кэш изображений", () => {
  it("хранит не больше 8 картинок и вытесняет самую давнюю", async () => {
    fetchMock.mockImplementation(async () => success());
    for (let i = 0; i < 9; i++) await generateImage({ prompt: `P${i}` });
    const calls = fetchMock.mock.calls.length;
    await generateImage({ prompt: "P8" });
    expect(fetchMock.mock.calls.length).toBe(calls);
    await generateImage({ prompt: "P0" });
    expect(fetchMock.mock.calls.length).toBe(calls + 1);
  });
});
