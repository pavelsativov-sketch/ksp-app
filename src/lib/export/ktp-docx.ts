import {
  AlignmentType, Document, Footer, HeadingLevel, Packer, PageNumber, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import type { Ktp } from "@/lib/ktp";
import { buildFreeWatermarkFooter } from "@/lib/export/docx";

export async function buildKtpDocx(ktp: Ktp, options: { watermark?: boolean } = {}): Promise<Buffer> {
  const kz = ktp.language === "kz";
  const labels = kz
    ? ["№", "Тақырып", "Сағат", "Күні", "Оқу мақсаттары"]
    : ["№", "Тема", "Часы", "Дата", "Цели обучения"];
  const widths = [6, 30, 9, 15, 40];
  const row = (values: string[], header = false) => new TableRow({
    tableHeader: header,
    cantSplit: true,
    children: values.map((text, index) => new TableCell({
      width: { size: widths[index], type: WidthType.PERCENTAGE },
      margins: { top: 80, bottom: 80, left: 100, right: 100 },
      ...(header ? { shading: { type: ShadingType.CLEAR, fill: "F2F4F6" } } : {}),
      children: text.split("\n").map((line) => new Paragraph({
        children: [new TextRun({ text: line, bold: header })],
      })),
    })),
  });
  const footer = options.watermark ? buildFreeWatermarkFooter() : new Footer({
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ children: [PageNumber.CURRENT], size: 18 }),
    ] })],
  });
  return Packer.toBuffer(new Document({
    creator: "Mekty",
    title: ktp.title,
    description: kz ? "КТЖ — жоба" : "КТП — черновик",
    styles: { default: { document: {
      run: { font: "Arial", size: 20, color: "000000" },
      paragraph: { spacing: { line: 312, after: 60 } },
    } } },
    sections: [{
      properties: { page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
      } },
      footers: { default: footer },
      children: [
        new Paragraph({
          text: kz ? "Күнтізбелік-тақырыптық жоспар — жоба" : "Календарно-тематический план — черновик",
          heading: HeadingLevel.HEADING_1, keepNext: true,
        }),
        new Paragraph({ text: ktp.title, keepNext: true }),
        new Paragraph({ text: `${kz ? "Пән" : "Предмет"}: ${ktp.subject || "—"} · ${kz ? "Сынып" : "Класс"}: ${ktp.grade}`, keepNext: true }),
        new Paragraph({
          text: kz
            ? "Жоба: ресми оқу бағдарламасы емес. Тақырыптар тізімі бойынша күндер аптасына бір рет жоспарланады (жексенбі — демалыс күні). Праздниктер мен каникулар ескерілмеген: мұғалім күндерді өзі түзетеді. Әр тақырыпқа 1 сағат, тақырыптың соңындағы «· 2 сағ.» белгісімен сағат саны өзгертіледі. Мақсаттар тек бастапқы сабақ тақырыбына көшірілген, қалғанын мұғалім толтырады."
            : "Черновик: не является официальной учебной программой. Даты проставлены по неделям от указанной (воскресенье — выходной); праздники и каникулы не учтены, их учитель правит вручную. На каждую тему 1 час, количество меняется пометкой «· 2 ч.» в конце строки. Цели перенесены только для темы исходного урока.",
          keepNext: true,
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [row(labels, true), ...ktp.rows.map((item) => row([
            String(item.number), item.topic, String(item.hours), item.date, item.objectives,
          ]))],
        }),
      ],
    }],
  }));
}
