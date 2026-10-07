import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateImage,
  resetImageCache,
  resetImageFailures,
  cooledDownProviders,
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

describe("Cloudflare image requests", () => {
  it("returns a successful image without retrying", async () => {
    fetchMock.mockResolvedValue(success());
    expect((await generateImage({ prompt: "Apple" })).base64).toBe(PNG_BYTES);
    expect(callsTo(FLUX2)).toBe(1);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it.each([429, 500, 503])("retries a transient HTTP %s only once", async (status) => {
    fetchMock.mockResolvedValueOnce(new Response("Temporary", { status, headers: { "Retry-After": "1" } })).mockResolvedValueOnce(success());
    const promise = generateImage({ prompt: "Apple" });
    await vi.runAllTimersAsync();
    expect((await promise).base64).toBe(PNG_BYTES);
    expect(callsTo(FLUX2)).toBe(2);
  });
  it("does not retry or expose an authentication error body", async () => {
    fetchMock.mockResolvedValue(new Response("secret-test-token", { status: 401 }));
    await expect(generateImage({ prompt: "Apple" })).rejects.toThrow("Cloudflare API error 401");
    expect(callsTo(FLUX2)).toBe(1);
  });
  it("does not retry a 400 and surfaces sanitized provider error codes", async () => {
    fetchMock.mockResolvedValue(Response.json(
      { errors: [{ code: 7001, message: "prompt validation failed" }] },
      { status: 400 },
    ));
    await expect(generateImage({ prompt: "Apple" })).rejects.toThrow("Cloudflare API error 400 [7001: prompt validation failed]");
    expect(callsTo(FLUX2)).toBe(1);
  });
  it("caps retries when the provider remains unavailable", async () => {
    fetchMock.mockImplementation(async () => new Response("Temporary", { status: 503 }));
    const assertion = expect(generateImage({ prompt: "Apple" })).rejects.toThrow("Cloudflare API error 503");
    await vi.runAllTimersAsync();
    await assertion;
    expect(callsTo(FLUX2)).toBe(2);
  });
  it("waits about a minute before the retry on 429", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Limited", { status: 429 })).mockResolvedValueOnce(success());
    const promise = generateImage({ prompt: "Apple" });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(callsTo(FLUX2)).toBe(1);
    await vi.advanceTimersByTimeAsync(10);
    expect(callsTo(FLUX2)).toBe(2);
    expect((await promise).base64).toBe(PNG_BYTES);
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

  it("при отказе FLUX.2 берёт картинку у резервного FLUX.1 schnell", async () => {
    // Без резерва единственный рабочий провайдер оставался единственным:
    // при его лимите иллюстрации не создавались вообще.
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes(FLUX2)
        ? new Response("busy", { status: 503 })
        : success(),
    );
    const result = await generateWithTimers({ prompt: "Apple" });
    expect(result.model).toBe("FLUX.1 schnell");
    expect(result.base64).toBe(PNG_BYTES);
    expect(callsTo(FLUX_SCHNELL)).toBe(1);
  });

  it("FLUX.1 schnell получает JSON без width/height: модель их не принимает", async () => {
    // Проверено живым запросом: с width/height Cloudflare отвечает 5006,
    // с multipart — 6003. Ошибка стоила бы всех иллюстраций.
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes(FLUX2) ? new Response("busy", { status: 503 }) : success(),
    );
    await generateWithTimers({ prompt: "Apple" });
    const schnellCall = fetchMock.mock.calls.find((call) => String(call[0]).includes(FLUX_SCHNELL));
    expect(schnellCall).toBeTruthy();
    const init = schnellCall![1] as RequestInit;
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    const body = JSON.parse(String(init.body));
    expect(body.width).toBeUndefined();
    expect(body.height).toBeUndefined();
    expect(body.prompt).toBeTruthy();
  });

  it("провайдер, дважды ответивший отказом, выводится из ротации", async () => {
    // Живая проба показала: Gemini отдаёт 503. Без паузы каждая иллюстрация
    // тратила три попытки по 120 секунд, прежде чем дойти до рабочего FLUX.
    vi.stubEnv("GEMINI_API_KEY", "gemini-key");
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("generativelanguage")
        ? new Response("overloaded", { status: 503 })
        : success(),
    );
    const geminiCalls = () =>
      fetchMock.mock.calls.filter((c) => String(c[0]).includes("generativelanguage")).length;

    // Первый отказ — ещё норма: провайдера не выводим.
    await generateWithTimers({ prompt: "Первая" });
    expect(cooledDownProviders()).not.toContain("Gemini");

    // Второй вызов к Gemini подряд — выводим на паузу. Каждый вызов внутри
    // делает ещё и три HTTP-попытки, поэтому счётчик запросов больше двух.
    await generateWithTimers({ prompt: "Вторая" });
    expect(cooledDownProviders()).toContain("Gemini");
    const geminiAfterCooldown = geminiCalls();
    expect(geminiAfterCooldown).toBeGreaterThan(1);

    // Третий вызов идёт сразу в рабочий провайдер, минуя Gemini целиком.
    const callsBefore = fetchMock.mock.calls.length;
    await generateWithTimers({ prompt: "Третья" });
    expect(geminiCalls()).toBe(geminiAfterCooldown);
    expect(fetchMock.mock.calls.length - callsBefore).toBe(1);
  });

  it("одиночный сбой не выводит провайдера из ротации", async () => {
    vi.stubEnv("GEMINI_API_KEY", "gemini-key");
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("generativelanguage")
        ? new Response("overloaded", { status: 503 })
        : success(),
    );
    await generateWithTimers({ prompt: "Раз" });
    expect(cooledDownProviders()).not.toContain("Gemini");
  });

  it("после успеха провайдер возвращается в ротацию", async () => {
    vi.stubEnv("GEMINI_API_KEY", "gemini-key");
    const geminiImage = { candidates: [{ content: { parts: [{ inlineData: { data: PNG_BYTES, mimeType: "image/png" } }] } }] };
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("generativelanguage") ? Response.json(geminiImage) : success(),
    );
    await generateWithTimers({ prompt: "Раз" });
    await generateWithTimers({ prompt: "Два" });
    expect(cooledDownProviders()).not.toContain("Gemini");
  });
});
