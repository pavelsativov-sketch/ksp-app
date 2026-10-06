import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { embedTexts } from "@/lib/rag/embed";
import { resetRagCache } from "@/lib/rag/cache";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.unstubAllEnvs();
  resetRagCache();
  // Глушим реальные ключи окружения: проверяем именно фолбэк.
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("embedTexts provider fallback", () => {
  it("returns none without keys", async () => {
    const r = await embedTexts(["текст"]);
    expect(r.provider).toBe("none");
    expect(r.vectors).toEqual([null]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses free Cloudflare embeddings when OpenAI key is missing", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acc");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "tok");
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ result: { data: [[0.1, 0.2], [0.3, 0.4]] } }),
    });
    const r = await embedTexts(["один", "два"]);
    expect(r.provider).toBe("cloudflare");
    expect(r.vectors).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    expect(fetchMock.mock.calls[0][0]).toContain("bge-m3");
  });

  it("throws on Cloudflare error (caller falls back to keyword search)", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "acc");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "tok");
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(embedTexts(["текст"])).rejects.toThrow(/500/);
  });
});
