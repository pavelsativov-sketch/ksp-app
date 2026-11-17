import React, { Fragment } from "react";

/**
 * Безопасный рендерер математических, физических и химических формул (без dangerouslySetInnerHTML).
 * Поддерживает:
 *  - блочные формулы $$...$$ и \[...\]
 *  - строчные формулы $...$ и \(...\)
 *  - \frac{a}{b}, \sqrt{x}, \sqrt[n]{x}, степени ^{...} / ^2, индексы _{...} / _2
 *  - греческие буквы (\alpha..\omega, \Delta, \Omega, \pi) и мат. операторы (\cdot, \times, \leq, \geq, \neq, \pm и др.)
 */

const LATEX_SYMBOLS: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  varepsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  upsilon: "υ",
  phi: "φ",
  varphi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Xi: "Ξ",
  Pi: "Π",
  Sigma: "Σ",
  Phi: "Φ",
  Psi: "Ψ",
  Omega: "Ω",
  cdot: "·",
  times: "×",
  div: "÷",
  pm: "±",
  mp: "∓",
  leq: "≤",
  le: "≤",
  geq: "≥",
  ge: "≥",
  neq: "≠",
  ne: "≠",
  approx: "≈",
  equiv: "≡",
  sim: "∼",
  infty: "∞",
  partial: "∂",
  nabla: "∇",
  forall: "∀",
  exists: "∃",
  in: "∈",
  notin: "∉",
  subset: "⊂",
  subseteq: "⊆",
  cup: "∪",
  cap: "∩",
  emptyset: "∅",
  rightarrow: "→",
  to: "→",
  leftarrow: "←",
  leftrightarrow: "↔",
  Rightarrow: "⇒",
  Leftrightarrow: "⇔",
  uparrow: "↑",
  downarrow: "↓",
  angle: "∠",
  triangle: "△",
  perp: "⊥",
  parallel: "∥",
  circ: "°",
  degree: "°",
  sum: "∑",
  prod: "∏",
  int: "∫",
  quad: "  ",
  qquad: "    ",
  ",": " ",
  ";": " ",
  "%": "%",
};

const TEXT_COMMANDS = new Set(["text", "mathrm", "mathbf", "mathit", "textbf", "textit"]);

export type MathSegment =
  | { kind: "text"; value: string }
  | { kind: "inline"; expr: string }
  | { kind: "block"; expr: string };

/**
 * Делит произвольный текст на обычный текст и формулы ($...$, $$...$$, \(...\), \[...\]).
 * Одиночные знаки доллара с пробелом после них (например «$100 и $200» без закрытия в строке)
 * проверяются аккуратно: строчная формула $...$ не переносит пустые строки и не начинается/кончается пробелом,
 * если внутри нет математических лексем.
 */
export function splitMathSegments(input: string): MathSegment[] {
  if (!input) return [];
  const out: MathSegment[] = [];
  const pattern = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^\n$]+?)\$/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input)) !== null) {
    const [full, blockDollar, blockBracket, inlineParen, inlineDollar] = match;
    if (inlineDollar !== undefined) {
      const trimmed = inlineDollar;
      // Защита от бытовых цен вроде "$100 ... $200": если после открывающего $ сразу пробел
      // или перед закрывающим $ пробел и внутри нет \, ^, _, =, +, /, то оставляем как текст.
      const looksLikeCurrency =
        (/^\s|\s$/.test(trimmed) && !/[\\^_=+/]/.test(trimmed)) ||
        /^\d+\s+[а-яёa-z]/iu.test(trimmed);
      if (looksLikeCurrency) {
        continue;
      }
    }

    if (match.index > lastIndex) {
      out.push({ kind: "text", value: input.slice(lastIndex, match.index) });
    }

    if (blockDollar !== undefined || blockBracket !== undefined) {
      out.push({ kind: "block", expr: (blockDollar ?? blockBracket ?? "").trim() });
    } else {
      out.push({ kind: "inline", expr: (inlineParen ?? inlineDollar ?? "").trim() });
    }
    lastIndex = match.index + full.length;
  }

  if (lastIndex < input.length) {
    out.push({ kind: "text", value: input.slice(lastIndex) });
  }
  return out;
}

/** Читает аргумент в фигурных скобках { ... } с учётом вложенности, начиная с индекса pos. */
function readBraced(src: string, pos: number): { content: string; next: number } | null {
  while (pos < src.length && src[pos] === " ") pos++;
  if (src[pos] !== "{") return null;
  let depth = 1;
  let i = pos + 1;
  while (i < src.length && depth > 0) {
    if (src[i] === "\\" && i + 1 < src.length) {
      i += 2;
      continue;
    }
    if (src[i] === "{") depth++;
    else if (src[i] === "}") depth--;
    i++;
  }
  if (depth !== 0) return null;
  return { content: src.slice(pos + 1, i - 1), next: i };
}

/** Читает опциональный аргумент [ ... ], например в \sqrt[3]{x}. */
function readBracketed(src: string, pos: number): { content: string; next: number } | null {
  while (pos < src.length && src[pos] === " ") pos++;
  if (src[pos] !== "[") return null;
  const close = src.indexOf("]", pos + 1);
  if (close === -1) return null;
  return { content: src.slice(pos + 1, close), next: close + 1 };
}

/** Читает одиночный атом для ^x или _2 (либо {группа}, либо \команда, либо 1 символ). */
function readAtom(src: string, pos: number): { content: string; next: number } {
  if (pos >= src.length) return { content: "", next: pos };
  if (src[pos] === "{") {
    const braced = readBraced(src, pos);
    if (braced) return braced;
  }
  if (src[pos] === "\\") {
    let end = pos + 1;
    while (end < src.length && /[A-Za-z]/.test(src[end]!)) end++;
    if (end === pos + 1 && end < src.length) end++;
    return { content: src.slice(pos, end), next: end };
  }
  return { content: src[pos]!, next: pos + 1 };
}

/** Рекурсивно преобразует LaTeX-выражение в безопасное дерево React-элементов. */
export function renderMathNodes(expr: string, keyPrefix = "m"): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let buf = "";
  let i = 0;
  let idx = 0;

  const flush = () => {
    if (buf) {
      nodes.push(buf);
      buf = "";
    }
  };

  while (i < expr.length) {
    const ch = expr[i]!;

    if (ch === "\\") {
      let end = i + 1;
      while (end < expr.length && /[A-Za-z]/.test(expr[end]!)) end++;
      if (end === i + 1 && end < expr.length) {
        const single = expr[end]!;
        if (single in LATEX_SYMBOLS) {
          buf += LATEX_SYMBOLS[single];
        } else {
          buf += single;
        }
        i = end + 1;
        continue;
      }

      const cmd = expr.slice(i + 1, end);
      if (cmd === "frac" || cmd === "dfrac" || cmd === "tfrac") {
        const num = readBraced(expr, end);
        const den = num ? readBraced(expr, num.next) : null;
        if (num && den) {
          flush();
          const k = `${keyPrefix}-f${idx++}`;
          nodes.push(
            <span
              key={k}
              className="mx-0.5 inline-flex flex-col items-center align-middle leading-tight"
              style={{ verticalAlign: "-0.35em" }}
            >
              <span className="border-b border-current px-1 pb-0.5 text-[0.88em]">
                {renderMathNodes(num.content, `${k}n`)}
              </span>
              <span className="px-1 pt-0.5 text-[0.88em]">
                {renderMathNodes(den.content, `${k}d`)}
              </span>
            </span>,
          );
          i = den.next;
          continue;
        }
      }

      if (cmd === "sqrt") {
        const deg = readBracketed(expr, end);
        const radStart = deg ? deg.next : end;
        const rad = readBraced(expr, radStart) ?? readAtom(expr, radStart);
        flush();
        const k = `${keyPrefix}-s${idx++}`;
        nodes.push(
          <span key={k} className="inline-flex items-baseline">
            {deg ? <sup className="-mr-0.5 text-[0.65em]">{renderMathNodes(deg.content, `${k}r`)}</sup> : null}
            <span aria-hidden="true" className="mr-0.5 font-serif">√</span>
            <span className="border-t border-current px-0.5">
              {renderMathNodes(rad.content, `${k}b`)}
            </span>
          </span>,
        );
        i = rad.next;
        continue;
      }

      if (TEXT_COMMANDS.has(cmd)) {
        const arg = readBraced(expr, end);
        if (arg) {
          flush();
          const k = `${keyPrefix}-t${idx++}`;
          nodes.push(
            <span key={k} className={cmd === "mathbf" || cmd === "textbf" ? "font-semibold not-italic" : "not-italic"}>
              {arg.content}
            </span>,
          );
          i = arg.next;
          continue;
        }
      }

      if (cmd === "left" || cmd === "right") {
        i = end;
        continue;
      }

      if (cmd in LATEX_SYMBOLS) {
        buf += LATEX_SYMBOLS[cmd];
        i = end;
        if (expr[i] === " " && /[A-Za-z]/.test(expr[i + 1] ?? "")) i++;
        continue;
      }

      // Тригонометрические и логарифмические функции прямым шрифтом
      if (/^(sin|cos|tg|tan|ctg|cot|arcsin|arccos|arctg|log|ln|lg|lim|max|min|gcd|lcm)$/.test(cmd)) {
        flush();
        nodes.push(<span key={`${keyPrefix}-fn${idx++}`} className="not-italic pr-0.5">{cmd}</span>);
        i = end;
        continue;
      }

      buf += cmd;
      i = end;
      continue;
    }

    if (ch === "^" || ch === "_") {
      const atom = readAtom(expr, i + 1);
      if (atom.content) {
        flush();
        const k = `${keyPrefix}-p${idx++}`;
        const inner = renderMathNodes(atom.content, k);
        nodes.push(
          ch === "^"
            ? <sup key={k} className="text-[0.75em] leading-none">{inner}</sup>
            : <sub key={k} className="text-[0.75em] leading-none">{inner}</sub>,
        );
        i = atom.next;
        continue;
      }
    }

    if (ch === "{" || ch === "}") {
      i++;
      continue;
    }

    if (ch === "-") {
      buf += "−";
      i++;
      continue;
    }

    buf += ch;
    i++;
  }

  flush();
  return nodes;
}

/**
 * Преобразует LaTeX-формулы в читаемый Unicode-текст для Word (.docx), PowerPoint (.pptx) и CSV.
 */
export function formatMathPlain(input: string): string {
  if (!input || (!input.includes("$") && !input.includes("\\"))) return input;

  const SUP_MAP: Record<string, string> = {
    "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
    "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
    "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", "n": "ⁿ",
  };
  const SUB_MAP: Record<string, string> = {
    "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
    "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
    "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
  };

  const convertExpr = (raw: string): string => {
    let s = raw.trim();
    s = s.replace(/\\(?:d|t)?frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)");
    s = s.replace(/\\sqrt\[([^\]]+)\]\{([^{}]+)\}/g, "√[$1]($2)");
    s = s.replace(/\\sqrt\{([^{}]+)\}/g, "√($1)");
    s = s.replace(/\\(?:text|mathrm|mathbf)\{([^{}]+)\}/g, "$1");
    s = s.replace(/\\left|\\right/g, "");
    s = s.replace(/\\([A-Za-z]+|[,;%])/g, (_m, cmd: string) => LATEX_SYMBOLS[cmd] ?? cmd);
    s = s.replace(/\^\{([^{}]+)\}/g, (_m, exp: string) =>
      [...exp].every((c) => c in SUP_MAP) ? [...exp].map((c) => SUP_MAP[c]).join("") : `^(${exp})`,
    );
    s = s.replace(/\^([0-9n])/g, (_m, c: string) => SUP_MAP[c] ?? `^${c}`);
    s = s.replace(/_\{([^{}]+)\}/g, (_m, sub: string) =>
      [...sub].every((c) => c in SUB_MAP) ? [...sub].map((c) => SUB_MAP[c]).join("") : `_(${sub})`,
    );
    s = s.replace(/_([0-9])/g, (_m, c: string) => SUB_MAP[c] ?? `_${c}`);
    return s.replace(/[{}]/g, "");
  };

  return splitMathSegments(input)
    .map((seg) => (seg.kind === "text" ? seg.value : convertExpr(seg.expr)))
    .join("");
}

/**
 * React-компонент для вывода текста с формулами ($...$, $$...$$) и сохранением переносов строк.
 */
export function MathText({
  text,
  className,
}: {
  text: string | null | undefined;
  className?: string;
}) {
  if (!text) return null;
  if (!text.includes("$") && !text.includes("\\(") && !text.includes("\\[")) {
    return className ? <span className={className}>{text}</span> : <>{text}</>;
  }

  const segments = splitMathSegments(text);
  const rendered = segments.map((seg, idx) => {
    if (seg.kind === "text") {
      return <Fragment key={idx}>{seg.value}</Fragment>;
    }
    if (seg.kind === "block") {
      return (
        <span
          key={idx}
          className="my-2 block overflow-x-auto rounded-lg bg-muted/50 px-3 py-2 text-center font-serif text-[1.06em]"
        >
          {renderMathNodes(seg.expr, `b${idx}`)}
        </span>
      );
    }
    return (
      <span key={idx} className="font-serif italic tracking-[0.01em]">
        {renderMathNodes(seg.expr, `i${idx}`)}
      </span>
    );
  });

  return className ? <span className={className}>{rendered}</span> : <>{rendered}</>;
}
