import { afterEach, describe, expect, it, vi } from "vitest";
import { generateImage, resetImageCache, resetImageFailures } from "@/lib/ai/image";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  resetImageCache();
  resetImageFailures();
});

describe("Krea", () => {
  it("создаёт задание, дожидается результата и скачивает картинку", async () => {
    vi.stubEnv("KREA_API_KEY", "id:secret");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ job_id: "job-1" }))
      .mockResolvedValueOnce(json({ status: "processing" }))
      .mockResolvedValueOnce(json({ status: "completed", result: { urls: ["https://cdn.example/img.png"] } }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = generateImage({ prompt: "plant cell", topic: "Клетка", subject: "Биология", grade: 7 });
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result).toMatchObject({ provider: "Krea", mimeType: "image/png", base64: "AQID" });
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.krea.ai/generate/image/bfl/flux-1-dev");
    expect(fetchMock.mock.calls[0]![1].headers.Authorization).toBe("Bearer id:secret");
    expect(fetchMock.mock.calls[1]![0]).toBe("https://api.krea.ai/jobs/job-1");
  });

  it("пустой баланс API даёт понятную ошибку, а не зависание", async () => {
    vi.stubEnv("KREA_API_KEY", "id:secret");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ message: "Please top up your API balance" }, 402)));
    await expect(generateImage({ prompt: "plant cell", topic: "Клетка", subject: "Биология", grade: 7 })).rejects.toThrow(/Krea API error 402/);
  });
});
