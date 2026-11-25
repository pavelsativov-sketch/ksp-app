import type PptxGenJS from "pptxgenjs";

/** Общий низ слайда для обеих презентаций (КСП и конструктор): пометка бесплатного тарифа и номер слайда. */

export const FOOTER_FONT_SIZE = 10;

export const WATERMARK_TEXT = {
  ru: "Создано в Mekty — бесплатный тариф",
  kz: "Mekty арқылы жасалды — тегін тариф",
} as const;

type Box = { x: number; y: number; w: number; h: number };

/** Пометка бесплатного тарифа. Несколько слоёв — чтобы текст читался и на светлом, и на тёмном фоне. */
export function addWatermark(slide: PptxGenJS.Slide, text: string, box: Box, layers: Array<{ color: string; transparency?: number }>): void {
  for (const layer of layers) slide.addText(text, { ...box, fontSize: FOOTER_FONT_SIZE, align: "left", ...layer });
}

export function addSlideNumber(slide: PptxGenJS.Slide, index: number, total: number, box: Box, color: string): void {
  slide.addText(`${index + 1} / ${total}`, { ...box, fontSize: FOOTER_FONT_SIZE, color, align: "right" });
}
