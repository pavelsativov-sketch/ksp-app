import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { emptyKsp, type LessonPlanRow } from "@/lib/types/ksp";
import { deckSlideSchema } from "@/lib/materials/deck-types";
import { buildKspPptx } from "./pptx";
import { buildDeckPptx } from "./deck-pptx";
import { WATERMARK_TEXT } from "./pptx-footer";

async function readDeck(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const xmlOf = async (pattern: RegExp) => {
    const files = zip.file(pattern).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return Promise.all(files.map((file) => file.async("string")));
  };
  const text = (xml: string) => [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(" ");
  const slides = (await xmlOf(/^ppt\/slides\/slide\d+\.xml$/)).map(text);
  const notes = (await xmlOf(/^ppt\/notesSlides\/notesSlide\d+\.xml$/)).map(text).join("\n");
  return { slides, notes };
}

function plan(language: "ru" | "kz"): LessonPlanRow {
  const content = emptyKsp();
  content.topic = "Фотосинтез";
  content.lessonObjectives = ["Объяснять роль хлорофилла"];
  content.stages.middle = {
    ...content.stages.middle,
    keyQuestions: ["Зачем листу свет?"],
    descriptors: ["называет продукты"],
    resources: "учебник",
  };
  return {
    id: "p1", owner_id: "u1", title: "Фотосинтез", subject_id: null, grade: 6, quarter: null, section: null,
    content, visibility: "private", language, created_at: "", updated_at: "",
  } as LessonPlanRow;
}

describe("buildKspPptx", () => {
  it("builds title, objectives, stage and thanks slides with numbering and watermark", async () => {
    const { slides } = await readDeck(await buildKspPptx(plan("ru"), { watermark: true }));
    expect(slides).toHaveLength(4);
    expect(slides[0]).toContain("Фотосинтез");
    expect(slides[1]).toContain("Объяснять роль хлорофилла");
    expect(slides[2]).toContain("Зачем листу свет?");
    expect(slides[3]).toContain("Спасибо за урок!");
    expect(slides.every((s) => s.includes(WATERMARK_TEXT.ru))).toBe(true);
    expect(slides[3]).toContain("4 / 4");
  });

  it("writes speaker notes in the plan language", async () => {
    const ru = await readDeck(await buildKspPptx(plan("ru")));
    expect(ru.notes).toContain("Оцениваем: называет продукты");
    expect(ru.notes).toContain("Нужно: учебник");

    const kz = await readDeck(await buildKspPptx(plan("kz"), { watermark: true }));
    expect(kz.notes).toContain("Бағалаймыз: называет продукты");
    expect(kz.notes).toContain("Қажет: учебник");
    expect(kz.notes).not.toContain("Оцениваем");
    expect(kz.slides[0]).toContain(WATERMARK_TEXT.kz);
  });
});

describe("buildDeckPptx", () => {
  it("keeps one slide per deck slide with numbering, notes and watermark", async () => {
    const slides = [
      deckSlideSchema.parse({ id: "a", kind: "title", title: "Клетка" }),
      deckSlideSchema.parse({ id: "b", kind: "list", title: "Органоиды", points: ["Ядро", "Митохондрия"], notes: "Спросить про ядро" }),
      deckSlideSchema.parse({ id: "c", kind: "thanks", title: "Спасибо!" }),
    ];
    const deck = await readDeck(await buildDeckPptx({ title: "Клетка", slides, theme: "lavender" }, { watermark: true }));
    expect(deck.slides).toHaveLength(3);
    expect(deck.slides[1]).toContain("Митохондрия");
    expect(deck.slides[2]).toContain("3 / 3");
    expect(deck.slides.every((s) => s.includes(WATERMARK_TEXT.ru))).toBe(true);
    expect(deck.notes).toContain("Спросить про ядро");

    const free = await readDeck(await buildDeckPptx({ title: "Клетка", slides, theme: "network" }));
    expect(free.slides.some((s) => s.includes(WATERMARK_TEXT.ru))).toBe(false);
  });
});
