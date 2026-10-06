import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateImage, resetImageCache } from "@/lib/ai/image";

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
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it.each([429, 500, 503])("retries a transient HTTP %s only once", async (status) => {
    fetchMock.mockResolvedValueOnce(new Response("Temporary", { status, headers: { "Retry-After": "1" } })).mockResolvedValueOnce(success());
    const promise = generateImage({ prompt: "Apple" });
    await vi.runAllTimersAsync();
    expect((await promise).base64).toBe(PNG_BYTES);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("does not retry or expose an authentication error body", async () => {
    fetchMock.mockResolvedValue(new Response("secret-test-token", { status: 401 }));
    await expect(generateImage({ prompt: "Apple" })).rejects.toThrow("Cloudflare API error 401");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not retry a 400 and surfaces sanitized provider error codes", async () => {
    fetchMock.mockResolvedValue(Response.json(
      { errors: [{ code: 7001, message: "prompt validation failed" }] },
      { status: 400 },
    ));
    await expect(generateImage({ prompt: "Apple" })).rejects.toThrow("Cloudflare API error 400 [7001: prompt validation failed]");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("caps retries when the provider remains unavailable", async () => {
    fetchMock.mockImplementation(async () => new Response("Temporary", { status: 503 }));
    const assertion = expect(generateImage({ prompt: "Apple" })).rejects.toThrow("Cloudflare API error 503");
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("waits about a minute before the retry on 429", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Limited", { status: 429 })).mockResolvedValueOnce(success());
    const promise = generateImage({ prompt: "Apple" });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await promise).base64).toBe(PNG_BYTES);
  });
});
