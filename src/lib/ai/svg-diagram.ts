import { z } from "zod";

/**
 * Детерминированный генератор учебных SVG-схем, чертежей и графиков (0 токенов, 0 сбоев квот).
 * Используется:
 *  1) напрямую через /api/ai/svg-diagram для задач по математике, физике, информатике, географии, естествознанию;
 *  2) как мгновенный образовательный fallback, когда внешние растровые провайдеры недоступны или для строгих чертежей.
 */

export const svgDiagramSpecSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("fraction"),
    numerator: z.number().int().min(0).max(24),
    denominator: z.number().int().min(1).max(24),
    shape: z.enum(["circle", "bar"]).optional().default("circle"),
    title: z.string().max(100).optional(),
  }),
  z.object({
    kind: z.literal("number_line"),
    min: z.number().min(-1000).max(1000),
    max: z.number().min(-1000).max(1000),
    step: z.number().positive().optional(),
    points: z.array(z.object({ value: z.number(), label: z.string().max(24).optional() })).max(10).default([]),
    title: z.string().max(100).optional(),
  }),
  z.object({
    kind: z.literal("coordinate_plane"),
    range: z.number().int().min(4).max(12).optional().default(6),
    points: z
      .array(z.object({ x: z.number(), y: z.number(), label: z.string().max(16).optional() }))
      .max(12)
      .optional()
      .default([]),
    line: z
      .object({ k: z.number(), b: z.number(), label: z.string().max(32).optional() })
      .optional(),
    parabola: z
      .object({ a: z.number(), b: z.number().default(0), c: z.number().default(0), label: z.string().max(32).optional() })
      .optional(),
    title: z.string().max(100).optional(),
  }),
  z.object({
    kind: z.literal("geometry"),
    figure: z.enum(["triangle", "right_triangle", "rectangle", "circle"]),
    labels: z.array(z.string().max(24)).max(6).optional().default([]),
    measurements: z.array(z.string().max(32)).max(4).optional().default([]),
    title: z.string().max(100).optional(),
  }),
  z.object({
    kind: z.literal("bar_chart"),
    bars: z
      .array(z.object({ label: z.string().max(24), value: z.number().min(0) }))
      .min(2)
      .max(8),
    unit: z.string().max(16).optional(),
    title: z.string().max(100).optional(),
  }),
  z.object({
    kind: z.literal("concept_map"),
    center: z.string().min(1).max(60),
    nodes: z.array(z.string().min(1).max(48)).min(2).max(6),
    title: z.string().max(100).optional(),
  }),
]);

export type SvgDiagramSpec = z.infer<typeof svgDiagramSpecSchema>;

function esc(raw: string | number | undefined): string {
  return String(raw ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapSvg(inner: string, title?: string): string {
  const heading = title
    ? `<text x="200" y="28" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#1e293b">${esc(title)}</text>`
    : "";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">`,
    `<rect width="400" height="400" rx="20" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>`,
    heading,
    inner,
    `</svg>`,
  ].join("");
}

function renderFraction(spec: Extract<SvgDiagramSpec, { kind: "fraction" }>): string {
  const den = Math.max(1, Math.min(24, spec.denominator));
  const num = Math.max(0, Math.min(den, spec.numerator));
  const title = spec.title ?? `Дробь ${spec.numerator}/${den}`;

  if (spec.shape === "bar") {
    const x0 = 40;
    const w = 320;
    const cellW = w / den;
    const cells = Array.from({ length: den }, (_, i) => {
      const filled = i < num;
      return `<rect x="${(x0 + i * cellW).toFixed(1)}" y="155" width="${cellW.toFixed(1)}" height="76" fill="${filled ? "#3b82f6" : "#eff6ff"}" stroke="#1e3a8a" stroke-width="2"/>`;
    }).join("");
    return wrapSvg(
      `${cells}<text x="200" y="295" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#1e3a8a">${num} / ${den}</text>`,
      title,
    );
  }

  const cx = 200;
  const cy = 195;
  const r = 115;
  if (den === 1) {
    return wrapSvg(
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${num >= 1 ? "#3b82f6" : "#eff6ff"}" stroke="#1e3a8a" stroke-width="2.5"/>` +
        `<text x="200" y="355" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#1e3a8a">${num} / ${den}</text>`,
      title,
    );
  }

  const sectors = Array.from({ length: den }, (_, i) => {
    const a1 = -Math.PI / 2 + (i * 2 * Math.PI) / den;
    const a2 = -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / den;
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2);
    const y2 = cy + r * Math.sin(a2);
    const largeArc = 2 * Math.PI / den > Math.PI ? 1 : 0;
    const filled = i < num;
    return `<path d="M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${filled ? "#3b82f6" : "#eff6ff"}" stroke="#1e3a8a" stroke-width="2"/>`;
  }).join("");

  return wrapSvg(
    `${sectors}<text x="200" y="355" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#1e3a8a">${spec.numerator} / ${den}</text>`,
    title,
  );
}

function renderNumberLine(spec: Extract<SvgDiagramSpec, { kind: "number_line" }>): string {
  const min = Math.min(spec.min, spec.max);
  const max = spec.max === spec.min ? spec.min + 10 : Math.max(spec.min, spec.max);
  const span = max - min;
  const step = spec.step && spec.step > 0 ? spec.step : Math.max(1, Math.round(span / 8));
  const xOf = (v: number) => 40 + ((v - min) / span) * 310;
  const y = 210;

  const ticks: string[] = [];
  for (let v = min, guard = 0; v <= max + 1e-9 && guard < 25; v += step, guard++) {
    const x = xOf(v);
    const label = Number.isInteger(v) ? String(v) : v.toFixed(1);
    ticks.push(
      `<line x1="${x.toFixed(1)}" y1="${y - 8}" x2="${x.toFixed(1)}" y2="${y + 8}" stroke="#334155" stroke-width="2"/>` +
        `<text x="${x.toFixed(1)}" y="${y + 26}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#475569">${esc(label)}</text>`,
    );
  }

  const pts = spec.points
    .filter((p) => p.value >= min && p.value <= max)
    .map((p, idx) => {
      const x = xOf(p.value);
      const colors = ["#dc2626", "#2563eb", "#16a34a", "#9333ea"];
      const color = colors[idx % colors.length]!;
      return (
        `<circle cx="${x.toFixed(1)}" cy="${y}" r="6.5" fill="${color}" stroke="#ffffff" stroke-width="2"/>` +
        (p.label
          ? `<text x="${x.toFixed(1)}" y="${y - 16}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="${color}">${esc(p.label)}</text>`
          : "")
      );
    })
    .join("");

  return wrapSvg(
    `<line x1="28" y1="${y}" x2="372" y2="${y}" stroke="#0f172a" stroke-width="2.5"/>` +
      `<polygon points="376,${y} 364,${y - 6} 364,${y + 6}" fill="#0f172a"/>` +
      `<text x="378" y="${y + 18}" font-family="Arial, sans-serif" font-size="13" font-style="italic" fill="#0f172a">x</text>` +
      ticks.join("") +
      pts,
    spec.title ?? "Координатная прямая",
  );
}

function renderCoordinatePlane(spec: Extract<SvgDiagramSpec, { kind: "coordinate_plane" }>): string {
  const R = spec.range ?? 6;
  const cx = 200;
  const cy = 210;
  const half = 145;
  const unit = half / R;
  const sx = (x: number) => cx + x * unit;
  const sy = (y: number) => cy - y * unit;

  const grid: string[] = [];
  for (let i = -R; i <= R; i++) {
    const gx = sx(i).toFixed(1);
    const gy = sy(i).toFixed(1);
    grid.push(`<line x1="${gx}" y1="${cy - half}" x2="${gx}" y2="${cy + half}" stroke="#e2e8f0" stroke-width="1"/>`);
    grid.push(`<line x1="${cx - half}" y1="${gy}" x2="${cx + half}" y2="${gy}" stroke="#e2e8f0" stroke-width="1"/>`);
    if (i !== 0 && (R <= 6 || i % 2 === 0)) {
      grid.push(`<text x="${gx}" y="${cy + 15}" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#64748b">${i}</text>`);
      grid.push(`<text x="${cx - 10}" y="${Number(gy) + 4}" text-anchor="end" font-family="Arial, sans-serif" font-size="10" fill="#64748b">${i}</text>`);
    }
  }

  let curves = "";
  if (spec.line) {
    const { k, b } = spec.line;
    const segments: string[] = [];
    for (let x = -R; x <= R; x += 0.25) {
      const y = k * x + b;
      if (y >= -R && y <= R) {
        segments.push(`${segments.length === 0 ? "M" : "L"} ${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`);
      }
    }
    if (segments.length > 1) {
      curves += `<path d="${segments.join(" ")}" fill="none" stroke="#2563eb" stroke-width="2.5"/>`;
    }
  }

  if (spec.parabola) {
    const { a, b, c } = spec.parabola;
    const segments: string[] = [];
    let drawing = false;
    for (let x = -R; x <= R; x += 0.1) {
      const y = a * x * x + b * x + c;
      if (y >= -R && y <= R) {
        segments.push(`${!drawing ? "M" : "L"} ${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`);
        drawing = true;
      } else {
        drawing = false;
      }
    }
    if (segments.length > 1) {
      curves += `<path d="${segments.join(" ")}" fill="none" stroke="#7c3aed" stroke-width="2.5"/>`;
    }
  }

  const pts = spec.points
    .filter((p) => Math.abs(p.x) <= R && Math.abs(p.y) <= R)
    .map((p) => {
      const px = sx(p.x).toFixed(1);
      const py = sy(p.y).toFixed(1);
      return (
        `<circle cx="${px}" cy="${py}" r="5" fill="#dc2626" stroke="#ffffff" stroke-width="1.5"/>` +
        (p.label
          ? `<text x="${Number(px) + 8}" y="${Number(py) - 6}" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#dc2626">${esc(p.label)}</text>`
          : "")
      );
    })
    .join("");

  const legend = spec.line?.label ?? spec.parabola?.label;

  return wrapSvg(
    grid.join("") +
      `<line x1="${cx - half - 8}" y1="${cy}" x2="${cx + half + 10}" y2="${cy}" stroke="#0f172a" stroke-width="2"/>` +
      `<polygon points="${cx + half + 14},${cy} ${cx + half + 4},${cy - 5} ${cx + half + 4},${cy + 5}" fill="#0f172a"/>` +
      `<line x1="${cx}" y1="${cy + half + 8}" x2="${cx}" y2="${cy - half - 10}" stroke="#0f172a" stroke-width="2"/>` +
      `<polygon points="${cx},${cy - half - 14} ${cx - 5},${cy - half - 4} ${cx + 5},${cy - half - 4}" fill="#0f172a"/>` +
      `<text x="${cx + half + 10}" y="${cy + 18}" font-family="Arial, sans-serif" font-size="13" font-style="italic" fill="#0f172a">x</text>` +
      `<text x="${cx + 12}" y="${cy - half - 4}" font-family="Arial, sans-serif" font-size="13" font-style="italic" fill="#0f172a">y</text>` +
      `<text x="${cx - 10}" y="${cy + 14}" font-family="Arial, sans-serif" font-size="11" fill="#475569">0</text>` +
      curves +
      pts +
      (legend
        ? `<text x="200" y="382" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#1e3a8a">${esc(legend)}</text>`
        : ""),
    spec.title ?? "Координатная плоскость",
  );
}

function renderGeometry(spec: Extract<SvgDiagramSpec, { kind: "geometry" }>): string {
  const L = spec.labels;
  const M = spec.measurements;
  let body = "";

  if (spec.figure === "right_triangle") {
    const a = L[0] ?? "A";
    const b = L[1] ?? "B";
    const c = L[2] ?? "C";
    body =
      `<polygon points="95,295 95,105 310,295" fill="#eff6ff" stroke="#1d4ed8" stroke-width="3"/>` +
      `<polyline points="95,273 117,273 117,295" fill="none" stroke="#1d4ed8" stroke-width="2"/>` +
      `<text x="76" y="102" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#0f172a">${esc(a)}</text>` +
      `<text x="318" y="302" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#0f172a">${esc(b)}</text>` +
      `<text x="74" y="308" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#0f172a">${esc(c)}</text>` +
      (M[0] ? `<text x="62" y="205" text-anchor="end" font-family="Arial, sans-serif" font-size="14" fill="#1e40af">${esc(M[0])}</text>` : "") +
      (M[1] ? `<text x="202" y="322" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#1e40af">${esc(M[1])}</text>` : "") +
      (M[2] ? `<text x="218" y="190" font-family="Arial, sans-serif" font-size="14" fill="#1e40af">${esc(M[2])}</text>` : "");
  } else if (spec.figure === "triangle") {
    const a = L[0] ?? "A";
    const b = L[1] ?? "B";
    const c = L[2] ?? "C";
    body =
      `<polygon points="80,295 205,95 325,295" fill="#eff6ff" stroke="#1d4ed8" stroke-width="3"/>` +
      `<text x="62" y="305" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#0f172a">${esc(a)}</text>` +
      `<text x="205" y="84" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#0f172a">${esc(b)}</text>` +
      `<text x="334" y="305" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#0f172a">${esc(c)}</text>` +
      (M[0] ? `<text x="126" y="188" text-anchor="end" font-family="Arial, sans-serif" font-size="14" fill="#1e40af">${esc(M[0])}</text>` : "") +
      (M[1] ? `<text x="278" y="188" font-family="Arial, sans-serif" font-size="14" fill="#1e40af">${esc(M[1])}</text>` : "") +
      (M[2] ? `<text x="202" y="322" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#1e40af">${esc(M[2])}</text>` : "");
  } else if (spec.figure === "rectangle") {
    const [a = "A", b = "B", c = "C", d = "D"] = L;
    body =
      `<rect x="80" y="125" width="240" height="150" fill="#eff6ff" stroke="#1d4ed8" stroke-width="3"/>` +
      `<text x="64" y="120" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#0f172a">${esc(b)}</text>` +
      `<text x="326" y="120" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#0f172a">${esc(c)}</text>` +
      `<text x="326" y="292" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#0f172a">${esc(d)}</text>` +
      `<text x="64" y="292" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#0f172a">${esc(a)}</text>` +
      (M[0] ? `<text x="200" y="302" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#1e40af">${esc(M[0])}</text>` : "") +
      (M[1] ? `<text x="68" y="205" text-anchor="end" font-family="Arial, sans-serif" font-size="14" fill="#1e40af">${esc(M[1])}</text>` : "");
  } else {
    const center = L[0] ?? "O";
    body =
      `<circle cx="200" cy="205" r="105" fill="#eff6ff" stroke="#1d4ed8" stroke-width="3"/>` +
      `<circle cx="200" cy="205" r="4" fill="#0f172a"/>` +
      `<line x1="200" y1="205" x2="305" y2="205" stroke="#dc2626" stroke-width="2.5"/>` +
      `<text x="190" y="224" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#0f172a">${esc(center)}</text>` +
      `<text x="252" y="195" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#dc2626">${esc(M[0] ?? "R")}</text>`;
  }

  return wrapSvg(body, spec.title ?? "Геометрический чертёж");
}

function renderBarChart(spec: Extract<SvgDiagramSpec, { kind: "bar_chart" }>): string {
  const maxVal = Math.max(1, ...spec.bars.map((b) => b.value));
  const chartW = 300;
  const chartH = 220;
  const x0 = 58;
  const y0 = 310;
  const slotW = chartW / spec.bars.length;
  const barW = Math.min(44, slotW * 0.62);
  const palette = ["#2563eb", "#0891b2", "#16a34a", "#d97706", "#9333ea", "#e11d48", "#4f46e5", "#0d9488"];

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const y = y0 - ratio * chartH;
      const val = Math.round(maxVal * ratio * 10) / 10;
      return (
        `<line x1="${x0}" y1="${y.toFixed(1)}" x2="${x0 + chartW}" y2="${y.toFixed(1)}" stroke="#e2e8f0" stroke-width="1"/>` +
        `<text x="${x0 - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-family="Arial, sans-serif" font-size="11" fill="#64748b">${val}${spec.unit ? ` ${esc(spec.unit)}` : ""}</text>`
      );
    })
    .join("");

  const bars = spec.bars
    .map((b, i) => {
      const h = (b.value / maxVal) * chartH;
      const x = x0 + i * slotW + (slotW - barW) / 2;
      const y = y0 - h;
      const color = palette[i % palette.length]!;
      return (
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="5" fill="${color}"/>` +
        `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#1e293b">${b.value}</text>` +
        `<text x="${(x + barW / 2).toFixed(1)}" y="${y0 + 18}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#334155">${esc(b.label.slice(0, 10))}</text>`
      );
    })
    .join("");

  return wrapSvg(
    grid +
      `<line x1="${x0}" y1="${y0 - chartH - 8}" x2="${x0}" y2="${y0}" stroke="#0f172a" stroke-width="2"/>` +
      `<line x1="${x0}" y1="${y0}" x2="${x0 + chartW + 8}" y2="${y0}" stroke="#0f172a" stroke-width="2"/>` +
      bars,
    spec.title ?? "Диаграмма",
  );
}

function renderConceptMap(spec: Extract<SvgDiagramSpec, { kind: "concept_map" }>): string {
  const cx = 200;
  const cy = 208;
  const r = 122;
  const colors = ["#dbeafe", "#dcfce7", "#fef3c7", "#fce7f3", "#ede9fe", "#cffafe"];
  const strokes = ["#2563eb", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#0891b2"];

  const lines: string[] = [];
  const boxes: string[] = [];

  spec.nodes.forEach((node, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / spec.nodes.length;
    const nx = cx + r * Math.cos(angle);
    const ny = cy + r * Math.sin(angle);
    lines.push(`<line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 3"/>`);
    const label = node.length > 20 ? `${node.slice(0, 19)}…` : node;
    boxes.push(
      `<rect x="${(nx - 58).toFixed(1)}" y="${(ny - 20).toFixed(1)}" width="116" height="40" rx="12" fill="${colors[i % colors.length]}" stroke="${strokes[i % strokes.length]}" stroke-width="2"/>` +
        `<text x="${nx.toFixed(1)}" y="${(ny + 5).toFixed(1)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11.5" font-weight="600" fill="#0f172a">${esc(label)}</text>`,
    );
  });

  const centerText = spec.center.length > 22 ? `${spec.center.slice(0, 21)}…` : spec.center;
  const centerNode =
    `<ellipse cx="${cx}" cy="${cy}" rx="68" ry="34" fill="#1e3a8a" stroke="#1d4ed8" stroke-width="2.5"/>` +
    `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12.5" font-weight="700" fill="#ffffff">${esc(centerText)}</text>`;

  return wrapSvg(lines.join("") + centerNode + boxes.join(""), spec.title);
}

/** Строит чистый SVG-документ 400×400 по спецификации. */
export function buildEducationalSvg(spec: SvgDiagramSpec): string {
  switch (spec.kind) {
    case "fraction":
      return renderFraction(spec);
    case "number_line":
      return renderNumberLine(spec);
    case "coordinate_plane":
      return renderCoordinatePlane(spec);
    case "geometry":
      return renderGeometry(spec);
    case "bar_chart":
      return renderBarChart(spec);
    case "concept_map":
      return renderConceptMap(spec);
  }
}

export function svgToBase64(svg: string): string {
  return Buffer.from(svg, "utf8").toString("base64");
}

export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${svgToBase64(svg)}`;
}

/**
 * Автоматически подбирает учебный SVG-чертёж/схему по тексту задания и теме урока.
 */
export function autoDetectDiagramSpec(input: {
  prompt: string;
  topic?: string;
  subject?: string;
}): SvgDiagramSpec {
  const combined = `${input.prompt} ${input.topic ?? ""} ${input.subject ?? ""}`;
  const lower = combined.toLowerCase();

  // 1. Обыкновенная дробь вида a/b
  const fracMatch = combined.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\b/);
  if (fracMatch || /дроб|бөлшек|fraction|pie|sector/i.test(lower)) {
    const n = fracMatch ? Number(fracMatch[1]) : 3;
    const d = fracMatch ? Math.max(2, Number(fracMatch[2])) : 8;
    if (d >= 2 && d <= 24 && n <= d) {
      return { kind: "fraction", numerator: n, denominator: d, shape: "circle", title: input.topic?.slice(0, 60) };
    }
  }

  // 2. Координатная плоскость / функция
  if (/координатн[а-яёa-z]*\s+плоскост|график\s+функц|парабол|coordinate\s+plane|parabola|linear\s+function|\by\s*=\s*/iu.test(lower)) {
    if (/x\^2|x²|парабол|квадратич/iu.test(lower)) {
      return { kind: "coordinate_plane", range: 6, parabola: { a: 1, b: 0, c: -2, label: "y = x² − 2" }, points: [{ x: 0, y: -2, label: "A" }] };
    }
    return { kind: "coordinate_plane", range: 6, line: { k: 1, b: 1, label: "y = x + 1" }, points: [{ x: 0, y: 1, label: "A(0;1)" }, { x: 2, y: 3, label: "B(2;3)" }] };
  }

  // 3. Числовая / координатная прямая
  if (/числов[а-яёa-z]*\s+прям|координатн[а-яёa-z]*\s+луч|координатн[а-яёa-z]*\s+прям|сан\s+түзуі|number\s+line/iu.test(lower)) {
    return {
      kind: "number_line",
      min: -5,
      max: 5,
      step: 1,
      points: [{ value: -2, label: "A" }, { value: 3, label: "B" }],
    };
  }

  // 4. Геометрия
  if (/прямоугольн[а-яёa-z]*\s+треугольн|пифагор|гипотенуз|тікбұрышты\s+үшбұрыш|right\s+triangle/iu.test(lower)) {
    return { kind: "geometry", figure: "right_triangle", labels: ["A", "B", "C"], measurements: ["a = 3 см", "b = 4 см", "c = 5 см"] };
  }
  if (/треугольн|үшбұрыш|triangle/i.test(lower)) {
    return { kind: "geometry", figure: "triangle", labels: ["A", "B", "C"], measurements: ["AB", "BC", "AC"] };
  }
  if (/окружност|круг|радиус|диаметр|шеңбер|circle|radius/i.test(lower)) {
    return { kind: "geometry", figure: "circle", labels: ["O"], measurements: ["R = 5 см"] };
  }
  if (/прямоугольн|периметр|площад|тіктөртбұрыш|rectangle/i.test(lower)) {
    return { kind: "geometry", figure: "rectangle", labels: ["A", "B", "C", "D"], measurements: ["a = 8 см", "b = 5 см"] };
  }

  // 5. Столбчатая диаграмма / статистика
  if (/диаграмм|гистограмм|статистик|bar\s+chart|chart/i.test(lower)) {
    return {
      kind: "bar_chart",
      title: (input.topic || "Сравнение показателей").slice(0, 50),
      bars: [
        { label: "А", value: 12 },
        { label: "Б", value: 19 },
        { label: "В", value: 15 },
        { label: "Г", value: 24 },
      ],
    };
  }

  // 6. Универсальная учебная концепт-схема по теме урока
  const center = (input.topic || input.subject || "Тема урока").trim().slice(0, 40);
  return {
    kind: "concept_map",
    center,
    title: input.subject ? `${input.subject}` : undefined,
    nodes: ["Понятие", "Признаки", "Примеры", "Применение"],
  };
}
