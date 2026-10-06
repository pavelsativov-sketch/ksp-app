import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildKtp, isCalendarDate, ktpRequestSchema } from "@/lib/ktp";
import { buildKtpDocx } from "@/lib/export/ktp-docx";
import { emptyKsp } from "@/lib/types/ksp";

const source = () => ({
  title: "Дроби", grade: 5, language: "ru" as const,
  content: { ...emptyKsp(), topic: "Дроби", learningObjectives: [{ code: "5.1", text: "Сравнивать дроби" }] },
});

describe("KTP draft generation", () => {
  it("defaults to the source topic and never adopts source date or invents a schedule", () => {
    const plan = source();
    plan.content.header.date = "2026-09-01";
    expect(buildKtp(plan, "Математика")).toEqual({
      title: "Дроби", subject: "Математика", grade: 5, language: "ru", draft: true,
      rows: [{ number: 1, topic: "Дроби", hours: 1, date: "", objectives: "5.1 — Сравнивать дроби" }],
    });
  });
  it("preserves topic order, dates only first row, and copies objectives only to exact trimmed matches", () => {
    const plan = source();
    const before = structuredClone(plan);
    const topics = [" Новая тема ", " Дроби ", "дроби"];
    const result = buildKtp(plan, "Математика", { topics, startDate: "2024-02-29" });
    expect(result.rows).toEqual([
      { number: 1, topic: "Новая тема", hours: 1, date: "2024-02-29", objectives: "" },
      { number: 2, topic: "Дроби", hours: 1, date: "", objectives: "5.1 — Сравнивать дроби" },
      { number: 3, topic: "дроби", hours: 1, date: "", objectives: "" },
    ]);
    expect(plan).toEqual(before);
    expect(topics[0]).toBe(" Новая тема ");
  });
  it("keeps missing objectives blank and preserves Kazakh metadata", () => {
    const plan = { ...source(), language: "kz" as const };
    plan.content.learningObjectives = [];
    expect(buildKtp(plan, "Математика")).toMatchObject({ language: "kz", rows: [{ objectives: "" }] });
  });
  it.each(["2024-02-29", "2000-02-29", "0001-01-01", "9999-12-31"])("accepts date %s", (date) => {
    expect(isCalendarDate(date)).toBe(true);
  });
  it.each(["2023-02-29", "1900-02-29", "2026-04-31", "2026-00-01", "2026-13-01", "2026-01-00", "0000-01-01", "2026-1-01", " 2026-01-01", "2026-01-01T00:00:00Z", ""])("rejects date %s", (date) => {
    expect(isCalendarDate(date)).toBe(false);
  });
  it("accepts 40 topics of 300 characters and trims whitespace", () => {
    expect(ktpRequestSchema.parse({ planId: "a".repeat(24), topics: Array(40).fill("я".repeat(300)) }).topics).toHaveLength(40);
    expect(ktpRequestSchema.parse({ planId: "a".repeat(24), topics: [" Тема "] }).topics).toEqual(["Тема"]);
  });
});

describe("KTP Word export", () => {
  it.each([true, false])("serializes draft/table, blank dates/objectives and server watermark=%s", async (watermark) => {
    const ktp = buildKtp(source(), "Математика", { topics: ["Дроби", "Новая <тема> & практика", "Повторение"], startDate: "2026-09-01" });
    const zip = await JSZip.loadAsync(await buildKtpDocx(ktp, { watermark }));
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("черновик");
    expect(xml).toContain("не является официальной учебной программой");
    expect(xml.match(/<w:tr>/g)).toHaveLength(4);
    expect(xml.match(/<w:cantSplit\/>/g)).toHaveLength(4);
    expect(xml).toContain("<w:tblHeader/>");
    expect(xml).toContain("w:tcMar");
    expect(xml.match(/2026-09-01/g)).toHaveLength(1);
    expect(xml.match(/5.1 — Сравнивать дроби/g)).toHaveLength(1);
    expect(xml).toContain("Новая &lt;тема&gt; &amp; практика");
    const footer = await zip.file(/^word\/footer\d*\.xml$/)[0].async("string");
    expect(footer.includes("бесплатный тариф")).toBe(watermark);
  });
  it("localizes the draft note and table headings in Kazakh", async () => {
    const ktp = buildKtp({ ...source(), language: "kz" }, "Математика");
    const zip = await JSZip.loadAsync(await buildKtpDocx(ktp));
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("ресми оқу бағдарламасы емес");
    expect(xml).toContain("Оқу мақсаттары");
  });
});
