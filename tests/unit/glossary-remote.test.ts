import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseGlossaryLine } from "@/components/ksp/glossary-button";
import { remoteSourceUrl, remoteTupObjectives } from "@/lib/goso/remote";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("parseGlossaryLine", () => {
  it("splits RU — KK pairs", () => {
    expect(parseGlossaryLine("числитель — алым")).toEqual({ ru: "числитель", kk: "алым" });
    expect(parseGlossaryLine("дробь - бөлшек")).toEqual({ ru: "дробь", kk: "бөлшек" });
    expect(parseGlossaryLine("без разделителя")).toBeNull();
  });
});

describe("remoteTupObjectives", () => {
  it("returns null without configured URL", async () => {
    expect(remoteSourceUrl()).toBeNull();
    expect(await remoteTupObjectives({ subject: "Информатика" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches, validates and filters by grade", async () => {
    vi.stubEnv("TUP_OBJECTIVES_SOURCE_URL", "https://tup.example.invalid/objectives.json");
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        objectives: [
          { code: "7.1.1.1", grade: 7, text_ru: "Защита данных", text_kz: "Деректерді қорғау", profile: "all" },
          { code: "8.1.1.1", grade: 8, text_ru: "Сети", profile: "emn" },
        ],
      }),
    });
    const rows = await remoteTupObjectives({ subject: "Информатика", grade: 7 });
    expect(rows).toHaveLength(1);
    expect(rows?.[0]).toMatchObject({ code: "7.1.1.1", text_ru: "Защита данных", text_kz: "Деректерді қорғау" });
  });

  it("falls back to null on bad schema", async () => {
    vi.stubEnv("TUP_OBJECTIVES_SOURCE_URL", "https://tup-bad.example.invalid/objectives.json");
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ wrong: [] }) });
    expect(await remoteTupObjectives({ subject: "Информатика" })).toBeNull();
  });
});
