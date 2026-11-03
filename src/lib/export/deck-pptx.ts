import PptxGenJS from "pptxgenjs";
import JSZip from "jszip";
import { DECK_PALETTES, type DeckPalette, type DeckSlide, type DeckTheme } from "@/lib/materials/deck-types";

/** Презентация из конструктора: макеты, цвета темы, переходы и появление элементов. */

const W = 13.33;
const H = 7.5;
const PAD = 0.6;
const CONTENT_W = W - PAD * 2;
const TITLE_H = 1.25;
const BODY_Y = 1.55;
const MASTER = "NET";

export type SlideImages = Map<string, { base64: string; mimeType: string }>;

type Reveal = { objectName: string };
const auto = (n: number | string): Reveal => ({ objectName: `auto-${n}` });
const click = (n: number | string): Reveal => ({ objectName: `click-${n}` });

/** Лёгкая сетка на фоне мастера: узор один на файл, а не на каждый слайд. */
function networkObjects(net: string): NonNullable<PptxGenJS.SlideMasterProps["objects"]> {
  const points = Array.from({ length: 16 }, (_, i) => ({
    x: ((i * 37 + 11) % 100) / 100 * W,
    y: ((i * 61 + 23) % 100) / 100 * H,
  }));
  const objects: NonNullable<PptxGenJS.SlideMasterProps["objects"]> = [];
  points.forEach((a, i) => {
    const b = points[(i + 5) % points.length]!;
    objects.push({
      line: {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        w: Math.abs(a.x - b.x),
        h: Math.abs(a.y - b.y),
        line: { color: net, width: 0.75 },
        flipV: (a.x - b.x) * (a.y - b.y) < 0,
      } as never,
    });
    objects.push({ rect: { x: a.x - 0.04, y: a.y - 0.04, w: 0.08, h: 0.08, fill: { color: net } } as never });
  });
  return objects;
}

interface Ctx {
  pres: PptxGenJS;
  s: PptxGenJS.Slide;
  p: DeckPalette;
  slide: DeckSlide;
  image?: { base64: string; mimeType: string };
}

function addTitle({ s, p, slide }: Ctx, align: "left" | "center" = "left") {
  s.addText(slide.title, { x: PAD, y: 0.3, w: CONTENT_W, h: TITLE_H, fontSize: 32, bold: true, color: p.ink, fontFace: "Arial", align, valign: "middle", fit: "shrink" });
}

function addImage({ s, image }: Ctx, box: { x: number; y: number; w: number; h: number }, reveal?: Reveal) {
  if (!image) return false;
  s.addImage({ data: `data:${image.mimeType};base64,${image.base64}`, ...box, sizing: { type: "cover", w: box.w, h: box.h }, rounding: false, ...reveal });
  return true;
}

function card(ctx: Ctx, text: string, box: { x: number; y: number; w: number; h: number }, opts: { fill: string; color?: string; fontSize?: number; bold?: boolean; line?: string; align?: "left" | "center" }, reveal?: Reveal) {
  ctx.s.addText(text, {
    shape: ctx.pres.ShapeType.roundRect,
    rectRadius: 0.12,
    ...box,
    fill: { color: opts.fill },
    line: { color: opts.line ?? opts.fill, width: 1 },
    color: opts.color ?? "ffffff",
    fontSize: opts.fontSize ?? 20,
    bold: opts.bold ?? false,
    fontFace: "Arial",
    align: opts.align ?? "center",
    valign: "middle",
    margin: 8,
    fit: "shrink",
    ...reveal,
  });
}

function addTakeaway(ctx: Ctx, text: string, reveal: Reveal) {
  ctx.s.addText(text, { shape: ctx.pres.ShapeType.rect, x: 0, y: H - 1, w: W, h: 1, fill: { color: ctx.p.band }, color: "ffffff", fontSize: 28, bold: true, fontFace: "Arial", align: "center", valign: "middle", fit: "shrink", ...reveal });
}

const LAYOUTS: Record<DeckSlide["kind"], (ctx: Ctx) => void> = {
  title(ctx) {
    const { s, p, slide, pres } = ctx;
    s.background = { color: p.soft };
    s.addShape(pres.ShapeType.ellipse, { x: 9.2, y: 0, w: 4.13, h: 4.13, fill: { color: p.accent, transparency: 8 }, line: { color: p.accent, width: 0, transparency: 100 }, ...auto("a") });
    s.addShape(pres.ShapeType.ellipse, { x: 8.3, y: 3.8, w: 2, h: 2, fill: { color: p.tones[0]!, transparency: 25 }, line: { color: p.tones[0]!, width: 0, transparency: 100 }, ...auto("b") });
    addImage(ctx, { x: 9.2, y: 3.3, w: 3.7, h: 3.7 }, auto("c"));
    s.addText(slide.title, { x: PAD, y: 1.5, w: 7.8, h: 2.6, fontSize: 42, bold: true, color: p.ink, fontFace: "Arial", valign: "middle", fit: "shrink", ...auto("d") });
    if (slide.lead) s.addText(slide.lead, { x: PAD, y: 4.2, w: 7.5, h: 0.8, fontSize: 24, bold: true, color: p.accent, fontFace: "Arial", ...auto("e") });
  },
  mood(ctx) {
    addTitle(ctx, "center");
    const phrases = ctx.slide.points.slice(0, 8);
    const half = Math.ceil(phrases.length / 2);
    const hasImage = addImage(ctx, { x: 4.4, y: BODY_Y + 0.2, w: 4.5, h: 4.6 }, auto("img"));
    const sideW = hasImage ? 3.5 : 5.9;
    const rowH = 5.3 / Math.max(half, 1);
    phrases.forEach((phrase, i) => {
      const left = i < half;
      const row = left ? i : i - half;
      const x = left ? PAD : W - PAD - sideW;
      card(ctx, phrase, { x, y: BODY_Y + row * rowH, w: sideW, h: rowH - 0.15 }, { fill: ctx.p.tones[i % ctx.p.tones.length]!, fontSize: 19, bold: true }, auto(i));
    });
  },
  guess(ctx) {
    addTitle(ctx, "center");
    const hasImage = addImage(ctx, { x: 1.6, y: BODY_Y, w: W - 3.2, h: ctx.slide.points.length ? 4.3 : 5.5 }, auto("img"));
    const y = hasImage ? 6 : BODY_Y;
    const w = CONTENT_W / Math.max(ctx.slide.points.length, 1);
    ctx.slide.points.slice(0, 3).forEach((point, i) => card(ctx, point, { x: PAD + i * w, y, w: w - 0.15, h: hasImage ? 1.2 : 2 }, { fill: ctx.p.soft, color: ctx.p.ink, line: ctx.p.net, fontSize: 18 }, click(i)));
  },
  goals(ctx) {
    addTitle(ctx);
    const goals = ctx.slide.points.slice(0, 6);
    const rowH = Math.min(1.25, 5.4 / Math.max(goals.length, 1));
    goals.forEach((goal, i) => {
      const y = BODY_Y + i * rowH;
      const tone = ctx.p.tones[i % ctx.p.tones.length]!;
      card(ctx, String(i + 1), { x: PAD, y, w: 0.9, h: rowH - 0.15 }, { fill: tone, fontSize: 26, bold: true }, auto(`n${i}`));
      card(ctx, goal, { x: PAD + 1, y, w: CONTENT_W - 1, h: rowH - 0.15 }, { fill: ctx.p.soft, color: ctx.p.ink, line: ctx.p.net, fontSize: 20, align: "left" }, auto(`t${i}`));
    });
  },
  flow(ctx) {
    const { s, p, slide, pres } = ctx;
    addTitle(ctx);
    if (slide.lead) s.addText(slide.lead, { x: PAD, y: 1.5, w: CONTENT_W, h: 0.9, fontSize: 20, color: p.muted, fontFace: "Arial", valign: "top", fit: "shrink", ...auto("lead") });
    const steps = slide.steps.slice(0, 4);
    const count = Math.max(steps.length, 1);
    const arrowW = 0.65;
    const boxW = (CONTENT_W - arrowW * (count - 1)) / count;
    const y = 2.55;
    const boxH = 1.75;
    steps.forEach((step, i) => {
      const x = PAD + i * (boxW + arrowW);
      card(ctx, step, { x, y, w: boxW, h: boxH }, { fill: p.tones[i % p.tones.length]!, fontSize: 24, bold: true }, auto(`b${i}`));
      if (i < count - 1) s.addShape(pres.ShapeType.rightArrow, { x: x + boxW + 0.08, y: y + boxH / 2 - 0.25, w: arrowW - 0.16, h: 0.5, fill: { color: p.accent }, line: { color: p.accent, width: 0 }, ...auto(`w${i}`) });
    });
    const captions = slide.points.slice(0, 4);
    const capW = CONTENT_W / Math.max(captions.length, 1);
    const capY = 4.55;
    captions.forEach((caption, i) => card(ctx, caption, { x: PAD + i * capW, y: capY, w: capW - 0.15, h: slide.takeaway ? 1.5 : 2.2 }, { fill: "ffffff", color: p.ink, line: p.tones[i % p.tones.length]!, fontSize: 18 }, auto(`c${i}`)));
    if (slide.takeaway) addTakeaway(ctx, slide.takeaway, auto("z"));
  },
  list(ctx) {
    const { s, p, slide } = ctx;
    addTitle(ctx);
    const bottom = slide.takeaway ? H - 1.2 : H - 0.45;
    const hasImage = addImage(ctx, { x: 7.8, y: BODY_Y, w: W - 7.8 - PAD, h: bottom - BODY_Y }, auto("img"));
    const w = hasImage ? 6.95 : CONTENT_W;
    const points = slide.points.slice(0, 6);
    const rowH = (bottom - BODY_Y) / Math.max(points.length, 1);
    points.forEach((point, i) => {
      s.addText(`•  ${point}`, { x: PAD, y: BODY_Y + i * rowH, w, h: rowH - 0.06, fontSize: 26, color: p.ink, fontFace: "Arial", valign: "middle", fit: "shrink", ...auto(i) });
    });
    if (slide.takeaway) addTakeaway(ctx, slide.takeaway, auto("z"));
  },
  cards(ctx) {
    addTitle(ctx);
    const items = ctx.slide.points.slice(0, 6);
    const cols = items.length <= 4 ? 2 : 3;
    const rows = Math.ceil(items.length / cols);
    const bottom = ctx.slide.takeaway ? H - 1.2 : H - 0.45;
    const w = (CONTENT_W - 0.2 * (cols - 1)) / cols;
    const h = (bottom - BODY_Y - 0.2 * (rows - 1)) / Math.max(rows, 1);
    items.forEach((item, i) => card(ctx, item, { x: PAD + (i % cols) * (w + 0.2), y: BODY_Y + Math.floor(i / cols) * (h + 0.2), w, h }, { fill: ctx.p.tones[i % ctx.p.tones.length]!, fontSize: 22, bold: true }, auto(i)));
    if (ctx.slide.takeaway) addTakeaway(ctx, ctx.slide.takeaway, auto("z"));
  },
  question(ctx) {
    const { s, p, slide, pres } = ctx;
    s.addText(slide.title, { shape: pres.ShapeType.wedgeRoundRectCallout, x: 1.2, y: 1, w: W - 2.4, h: 3, fill: { color: p.accent }, color: "ffffff", fontSize: 34, bold: true, fontFace: "Arial", align: "center", valign: "middle", margin: 14, fit: "shrink", ...auto("q") });
    const answers = slide.points.slice(0, 3);
    const w = CONTENT_W / Math.max(answers.length, 1);
    answers.forEach((answer, i) => card(ctx, answer, { x: PAD + i * w, y: 4.8, w: w - 0.15, h: 1.8 }, { fill: p.soft, color: p.ink, line: p.net, fontSize: 20 }, click(i)));
  },
  quiz(ctx) {
    const { s, p, slide, pres } = ctx;
    addTitle(ctx);
    const options = slide.options.slice(0, 4);
    const gap = 0.25;
    const w = (CONTENT_W - gap) / 2;
    const h = 2.2;
    const letters = ["А", "Б", "В", "Г"];
    options.forEach((option, i) => {
      const x = PAD + (i % 2) * (w + gap);
      const y = BODY_Y + 0.2 + Math.floor(i / 2) * (h + gap);
      card(ctx, `${letters[i]}.  ${option}`, { x, y, w, h }, { fill: p.soft, color: p.ink, line: p.tones[i % p.tones.length]!, fontSize: 26, bold: true }, auto(i));
      // Верный вариант подсвечивается по клику учителя, а не сразу.
      if (i === slide.correctIndex) {
        s.addText(`✓  ${option}`, { shape: pres.ShapeType.roundRect, rectRadius: 0.12, x, y, w, h, fill: { color: "2fa45f" }, line: { color: "2fa45f", width: 1 }, color: "ffffff", fontSize: 26, bold: true, fontFace: "Arial", align: "center", valign: "middle", margin: 8, fit: "shrink", ...click("answer") });
      }
    });
  },
  activity(ctx) {
    const { s, p, slide } = ctx;
    addTitle(ctx, "center");
    if (slide.lead) s.addText(slide.lead, { x: PAD, y: 1.5, w: CONTENT_W, h: 0.7, fontSize: 22, bold: true, color: p.accent, fontFace: "Arial", align: "center", ...auto("lead") });
    const steps = slide.points.slice(0, 6);
    const rowH = Math.min(1.2, 4.6 / Math.max(steps.length, 1));
    steps.forEach((step, i) => card(ctx, `${i + 1}.  ${step}`, { x: 1.2, y: 2.35 + i * rowH, w: W - 2.4, h: rowH - 0.12 }, { fill: p.tones[i % p.tones.length]!, fontSize: 22, bold: true, align: "left" }, auto(i)));
  },
  reflection(ctx) {
    const { s, p, slide, pres } = ctx;
    addTitle(ctx, "center");
    const colors = ["35b34a", "2f7bf0", "e5352d"];
    const labels = slide.points.slice(0, 3);
    const w = CONTENT_W / 3;
    labels.forEach((label, i) => {
      const x = PAD + i * w;
      s.addShape(pres.ShapeType.ellipse, { x: x + w / 2 - 1.1, y: 2, w: 2.2, h: 2.2, fill: { color: colors[i]! }, line: { color: "d4d6e4", width: 5 }, ...auto(`l${i}`) });
      s.addText(label, { x, y: 4.45, w: w - 0.1, h: 1.2, fontSize: 24, bold: true, color: p.ink, fontFace: "Arial", align: "center", valign: "top", fit: "shrink", ...auto(`t${i}`) });
    });
  },
  homework(ctx) {
    addTitle(ctx, "center");
    const items = ctx.slide.points.slice(0, 6);
    const rowH = Math.min(1.6, 5.2 / Math.max(items.length, 1));
    items.forEach((item, i) => card(ctx, item, { x: 1, y: BODY_Y + i * rowH, w: W - 2, h: rowH - 0.15 }, { fill: ctx.p.soft, color: ctx.p.ink, line: ctx.p.net, fontSize: 22, align: "left" }, auto(i)));
  },
  thanks(ctx) {
    const { s, p, slide } = ctx;
    s.background = { color: p.accent };
    s.addText(slide.title, { x: PAD, y: 2.2, w: CONTENT_W, h: 1.7, fontSize: 56, bold: true, color: "ffffff", fontFace: "Arial", align: "center", fit: "shrink", ...auto("t") });
    if (slide.lead) s.addText(slide.lead, { x: 1.5, y: 4.1, w: W - 3, h: 1.5, fontSize: 20, color: "ffffff", fontFace: "Arial", align: "center", valign: "top", fit: "shrink", ...auto("l") });
  },
};

/** Появление элементов по одному. Служебные имена объектов задают порядок и способ запуска. */
export function timingXml(autoIds: number[], clickIds: number[]): string {
  if (autoIds.length === 0 && clickIds.length === 0) return "";
  let id = 2;
  const next = () => (id += 1);
  const STEP_MS = 280;
  const effect = (spid: number, nodeType: "afterEffect" | "clickEffect") => {
    const outer = next();
    const setId = next();
    const animId = next();
    return `<p:par><p:cTn id="${outer}" presetID="10" presetClass="entr" presetSubtype="0" fill="hold" nodeType="${nodeType}"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>`
      + `<p:set><p:cBhvr><p:cTn id="${setId}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>`
      + `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${animId}" dur="500"/><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl></p:cBhvr></p:animEffect>`
      + `</p:childTnLst></p:cTn></p:par>`;
  };
  const inner = (delay: number, body: string) => `<p:par><p:cTn id="${next()}" fill="hold"><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst><p:childTnLst>${body}</p:childTnLst></p:cTn></p:par>`;
  const groups: string[] = [];
  if (autoIds.length) {
    const steps = autoIds.map((spid, i) => inner(i * STEP_MS, effect(spid, "afterEffect"))).join("");
    groups.push(`<p:par><p:cTn id="${next()}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst>${steps}</p:childTnLst></p:cTn></p:par>`);
  }
  clickIds.forEach((spid) => {
    groups.push(`<p:par><p:cTn id="${next()}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst>${inner(0, effect(spid, "clickEffect"))}</p:childTnLst></p:cTn></p:par>`);
  });
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${groups.join("")}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
}

// Как в презентациях учителя: «полёт» в новых PowerPoint и обычное затухание в старых.
const TRANSITION = `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"><mc:Choice Requires="p14"><p:transition spd="slow" p14:dur="800"><p14:flythrough/></p:transition></mc:Choice><mc:Fallback><p:transition spd="slow"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>`;

/** PptxGenJS не умеет анимацию, поэтому переходы и появление дописываются прямо в XML слайдов. */
export async function addAnimations(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const files = zip.file(/^ppt\/slides\/slide\d+\.xml$/);
  await Promise.all(files.map(async (file) => {
    const xml = await file.async("string");
    const ids = (prefix: string) => [...xml.matchAll(new RegExp(`<p:cNvPr id="(\\d+)" name="${prefix}-[^"]*"`, "g"))].map((match) => Number(match[1]));
    const addition = TRANSITION + timingXml(ids("auto"), ids("click"));
    const anchor = "</p:clrMapOvr>";
    const position = xml.lastIndexOf(anchor);
    if (position < 0) return;
    const at = position + anchor.length;
    zip.file(file.name, xml.slice(0, at) + addition + xml.slice(at));
  }));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export async function buildDeckPptx(
  deck: { title: string; slides: DeckSlide[]; theme: DeckTheme },
  options: { images?: SlideImages; watermark?: boolean } = {},
): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  pres.author = "Mekty";
  pres.title = deck.title;
  const p = DECK_PALETTES[deck.theme];
  pres.defineSlideMaster({ title: MASTER, background: { color: "ffffff" }, objects: networkObjects(p.net) });

  deck.slides.forEach((slide, index) => {
    const s = pres.addSlide({ masterName: MASTER });
    LAYOUTS[slide.kind]({ pres, s, p, slide, image: options.images?.get(slide.id) });
    if (slide.notes) s.addNotes(slide.notes);
    const dark = slide.kind === "thanks" || Boolean(slide.takeaway);
    s.addText(`${index + 1} / ${deck.slides.length}`, { x: 11.9, y: 7.08, w: 1.2, h: 0.3, fontSize: 10, color: dark ? "ffffff" : p.muted, align: "right" });
    if (options.watermark) s.addText("Создано в Mekty — бесплатный тариф", { x: PAD, y: 7.08, w: 6, h: 0.3, fontSize: 10, color: dark ? "ffffff" : p.muted });
  });

  return addAnimations((await pres.write({ outputType: "nodebuffer" })) as Buffer);
}
