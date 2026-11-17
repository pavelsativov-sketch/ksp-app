import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { formatMathPlain, MathText, splitMathSegments } from "@/lib/math/render-math";
import { autoDetectDiagramSpec, buildEducationalSvg } from "@/lib/ai/svg-diagram";
import {
  ATTENDANCE_CODES,
  buildJournalDocx,
  exportJournalToCsv,
  scaleHomeworkToTen,
  type JournalState,
} from "@/lib/journal";
import { buildGroupWorkDocx } from "@/lib/handouts/group-work-docx";
import { buildOfficialMarkdownDocx } from "@/lib/export/markdown-docx";
import { buildSorSochDocx, type SorSochWork } from "@/lib/ai/sor-soch-generator";
import { parseKtpRows } from "@/lib/ktp-import";
import { getSessionSecretBytes, SESSION_COOKIE_NAME } from "@/lib/session-token";
import { proxy } from "@/proxy";

describe("Math & Science formula renderer", () => {
  it("splits inline and block formulas while preserving plain currency amounts", () => {
    const segs = splitMathSegments("Цена $100 и $200, а уравнение $x^2 + y^2 = r^2$ и $$\\frac{3}{4}$$");
    expect(segs.some((s) => s.kind === "inline" && s.expr === "x^2 + y^2 = r^2")).toBe(true);
    expect(segs.some((s) => s.kind === "block" && s.expr === "\\frac{3}{4}")).toBe(true);
    expect(segs[0]).toMatchObject({ kind: "text" });
    expect((segs[0] as { value: string }).value).toContain("$100 и $200");
  });

  it("formats LaTeX formulas to readable plain text for Word/PPTX", () => {
    expect(formatMathPlain("Решите $\\frac{x^2}{4} \\leq \\sqrt{9}$")).toBe("Решите (x²)/(4) ≤ √(9)");
    expect(formatMathPlain("Формула воды $H_2O$")).toBe("Формула воды H₂O");
  });

  it("renders MathText safely without raw HTML injection", () => {
    const html = renderToStaticMarkup(
      <MathText text="Формула $\frac{a+b}{2}$ и <script>alert(1)</script>" />,
    );
    expect(html).toContain("a+b");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("Educational SVG diagram generator", () => {
  it("renders valid vector SVG for all supported diagram kinds", () => {
    const specs = [
      autoDetectDiagramSpec({ prompt: "Изобразите дробь 3/8 на круге", subject: "Математика" }),
      autoDetectDiagramSpec({ prompt: "Отметьте точки на числовой прямой", subject: "Математика" }),
      autoDetectDiagramSpec({ prompt: "Постройте график функции y = x^2 - 2 на координатной плоскости" }),
      autoDetectDiagramSpec({ prompt: "Прямоугольный треугольник и теорема Пифагора" }),
      autoDetectDiagramSpec({ prompt: "Столбчатая диаграмма успеваемости" }),
      autoDetectDiagramSpec({ prompt: "Основные понятия информатики", topic: "Информация" }),
    ];

    expect(specs.map((s) => s.kind)).toEqual([
      "fraction",
      "number_line",
      "coordinate_plane",
      "geometry",
      "bar_chart",
      "concept_map",
    ]);

    for (const spec of specs) {
      const svg = buildEducationalSvg(spec);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
    }
  });
});

describe("Electronic journal (1–10 scale + УП / НП / Б)", () => {
  it("scales homework scores strictly into 1..10 range", () => {
    expect(scaleHomeworkToTen(0, 10)).toBe(1);
    expect(scaleHomeworkToTen(5, 10)).toBe(5);
    expect(scaleHomeworkToTen(18, 20)).toBe(9);
    expect(scaleHomeworkToTen(25, 20)).toBe(10);
  });

  it("exports CSV with attendance codes and neutralizes Excel formula injection", async () => {
    expect(ATTENDANCE_CODES.excused.ru).toBe("УП");
    expect(ATTENDANCE_CODES.unexcused.ru).toBe("НП");
    expect(ATTENDANCE_CODES.sick.ru).toBe("Б");

    const sample: JournalState = {
      classes: ["8А"],
      subjects: ["Алгебра"],
      dates: ["2026-11-17", "2026-11-18"],
      assignments: [],
      students: [
        {
          id: "507f1f77bcf86cd799439011",
          fullName: "=HYPERLINK(\"http://evil\",\"Арман\")",
          className: "8А",
          source: "homework",
          averageScore: 9,
          scoresCount: 1,
          qualityPercent: 100,
          excusedCount: 0,
          unexcusedCount: 0,
          sickCount: 1,
        },
      ],
      entries: [
        {
          studentId: "507f1f77bcf86cd799439011",
          subject: "Алгебра",
          date: "2026-11-17",
          score: 9,
          attendance: null,
        },
        {
          studentId: "507f1f77bcf86cd799439011",
          subject: "Алгебра",
          date: "2026-11-18",
          score: null,
          attendance: "sick",
        },
      ],
    };

    const csv = exportJournalToCsv(sample, { className: "8А", subject: "Алгебра" });
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain(",9,Б,");

    const docx = await buildJournalDocx(sample, { className: "8А", subject: "Алгебра" });
    expect(docx.subarray(0, 2).toString("utf8")).toBe("PK");
  });
});

describe("Word (.docx) builders & KTP bulk parser", () => {
  it("packs valid .docx files for Group Cards, Official School Reports, and SOR/SOCH", async () => {
    const groupBuf = await buildGroupWorkDocx({
      kind: "group",
      mode: "group",
      language: "ru",
      topic: "Информация",
      cards: [
        {
          title: "Команда 1",
          situation: ["Алия передала сообщение по сети.", "Сообщение дошло за 2 секунды."],
          tasks: [{ text: "Определите источник", schema: ["Источник", "Канал", "Приёмник"] }],
          value: "Ответственность",
          note: "Вперёд!",
          slogan: "Знание — сила",
          imagePrompt: "",
        },
      ],
    });
    expect(groupBuf.subarray(0, 2).toString("utf8")).toBe("PK");

    const mdBuf = await buildOfficialMarkdownDocx({
      title: "СПРАВКА ВШК",
      subtitle: "Проверка КСП",
      content: "# Итоги проверки\n- Проверено **15 уроков**\n\n| Класс | Качество |\n|---|---|\n| 8А | 78% |",
      schoolName: "Школа-лицей №1",
      teacherName: "Ахметова А.Б.",
    });
    expect(mdBuf.subarray(0, 2).toString("utf8")).toBe("PK");

    const sampleSor: SorSochWork = {
      title: "СОР №1 по Алгебре",
      subject: "Алгебра",
      grade: 8,
      quarter: 1,
      workType: "СОР №1",
      language: "ru",
      durationMinutes: 25,
      maxPoints: 5,
      sectionOrTopic: "Квадратные корни",
      learningObjectives: ["8.1.1.1 знать иррациональные числа"],
      thinkingLevels: { knowledgePercent: 40, applicationPercent: 40, higherOrderPercent: 20 },
      variant1: [
        { number: 1, level: "knowledge", taskType: "mcq", prompt: "Вычислите $\\sqrt{16}$", options: ["2", "4", "8", "16"], points: 2 },
        { number: 2, level: "application", taskType: "short", prompt: "Упростите $\\sqrt{50}$", options: null, points: 2 },
        { number: 3, level: "higher_order", taskType: "extended", prompt: "Докажите иррациональность", options: null, points: 1 },
      ],
      variant2: [
        { number: 1, level: "knowledge", taskType: "mcq", prompt: "Вычислите $\\sqrt{25}$", options: ["3", "5", "10", "25"], points: 2 },
        { number: 2, level: "application", taskType: "short", prompt: "Упростите $\\sqrt{72}$", options: null, points: 2 },
        { number: 3, level: "higher_order", taskType: "extended", prompt: "Докажите свойство", options: null, points: 1 },
      ],
      descriptors: [
        { taskNumber: 1, criterion: "Находит корень", steps: ["Выбирает верный ответ"], points: 2, answerVariant1: "4", answerVariant2: "5" },
        { taskNumber: 2, criterion: "Упрощает выражение", steps: ["Выносит множитель"], points: 2, answerVariant1: "5√2", answerVariant2: "6√2" },
        { taskNumber: 3, criterion: "Обосновывает вывод", steps: ["Приводит доказательство"], points: 1, answerVariant1: "Доказано", answerVariant2: "Доказано" },
      ],
      rubric: [
        { criterion: "Работа с квадратными корнями", low: "Допускает ошибки", medium: "Вычисляет с неточностями", high: "Безошибочно вычисляет" },
      ],
    };
    const sorBuf = await buildSorSochDocx(sampleSor);
    expect(sorBuf.subarray(0, 2).toString("utf8")).toBe("PK");
  });

  it("parses pasted Excel TSV and numbered KTP rows", () => {
    const raw = [
      "Раздел 1. Квадратные корни",
      "№\tТема урока\tЧасы\tЦели",
      "1\tИррациональные числа\t1\t8.1.1.1",
      "2\tСвойства арифметического корня\t2\t8.1.2.1",
    ].join("\n");

    const rows = parseKtpRows(raw);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      section: "Раздел 1. Квадратные корни",
      title: "Иррациональные числа",
      hours: 1,
      objectives: "8.1.1.1",
    });
    expect(rows[1]?.hours).toBe(2);
  });
});

describe("Next.js 16 proxy.ts route guard", () => {
  it("redirects anonymous guests on protected routes when MONGODB_URI is set and allows signed JWTs", async () => {
    const prevMongo = process.env.MONGODB_URI;
    process.env.MONGODB_URI = "mongodb://localhost:27017/ksp_test";
    try {
      const anonReq = new NextRequest("http://localhost:3000/gradebook?tab=1");
      const anonRes = await proxy(anonReq);
      expect(anonRes.status).toBe(307);
      expect(anonRes.headers.get("location")).toContain("/login?next=%2Fgradebook%3Ftab%3D1");

      const token = await new SignJWT({ sub: "507f1f77bcf86cd799439011", sessionVersion: 0 })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("2h")
        .sign(getSessionSecretBytes());

      const authedReq = new NextRequest("http://localhost:3000/gradebook", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      });
      const authedRes = await proxy(authedReq);
      expect(authedRes.status).toBe(200);
      expect(authedRes.headers.get("x-request-id")).toBeTruthy();
    } finally {
      if (prevMongo === undefined) delete process.env.MONGODB_URI;
      else process.env.MONGODB_URI = prevMongo;
    }
  });
});
