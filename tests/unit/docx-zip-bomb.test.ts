/**
 * M4: импорт .docx отклоняет архивы, которые распаковываются в огромный объём
 * или содержат тысячи файлов, до (или во время) распаковки.
 */
import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

vi.mock("@/lib/api-auth", () => ({ requireApiAuth: async () => ({ user: { id: "a".repeat(24) } }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimitAsync: async () => ({ ok: true }), clientIp: () => "1.1.1.1" }));
vi.mock("@/lib/plans-repo", () => ({ listSubjects: async () => [] }));

import { DocxLimitError, parseDocxWithMeta } from "@/lib/import/docx";
import { POST } from "@/app/api/import/docx/route";

const compress = (zip: JSZip) =>
  zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });

/** 31 МБ нулей в document.xml — сжимается до ~30 КБ. */
async function bomb(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("word/document.xml", Buffer.alloc(31 * 1024 * 1024, 0x20));
  return compress(zip);
}

async function manyEntries(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("word/document.xml", "<w:document/>");
  for (let i = 0; i < 2001; i++) zip.file(`x/${i}.txt`, "");
  return compress(zip);
}

/** Подделанный центральный каталог: заявлено 1 байт, фактически 31 МБ. */
async function lyingBomb(): Promise<Buffer> {
  const buf = await bomb();
  const cd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  buf.writeUInt32LE(1, cd + 24); // uncompressed size в записи каталога
  const local = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  buf.writeUInt32LE(1, local + 22); // и в локальном заголовке
  return buf;
}

describe("parseDocxWithMeta: лимиты архива", () => {
  it("отклоняет архив, распаковывающийся больше чем в 30 МБ (413)", async () => {
    const buf = await bomb();
    expect(buf.length).toBeLessThan(1024 * 1024);
    await expect(parseDocxWithMeta(buf)).rejects.toMatchObject({ status: 413 });
  });

  it("отклоняет архив больше чем из 2000 файлов (400)", async () => {
    await expect(parseDocxWithMeta(await manyEntries())).rejects.toMatchObject({ status: 400 });
  });

  it("не верит заниженному размеру в каталоге: читает с отсечкой", async () => {
    await expect(parseDocxWithMeta(await lyingBomb())).rejects.toBeInstanceOf(Error);
  });
});

describe("POST /api/import/docx", () => {
  it("отвечает 413 с понятным текстом на zip-бомбу", async () => {
    const form = new FormData();
    form.set("file", new File([new Uint8Array(await bomb())], "plan.docx"));
    const res = await POST(new Request("http://x/api/import/docx", { method: "POST", body: form }));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toMatch(/больше 30 МБ/);
  });

  it("DocxLimitError несёт HTTP-статус", () => {
    expect(new DocxLimitError(400, "x").status).toBe(400);
  });
});
