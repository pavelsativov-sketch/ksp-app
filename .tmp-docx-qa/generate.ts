import { writeFileSync } from "node:fs";
import { buildHandoutDocx } from "../src/lib/handouts/docx";

const sample = {
  kind: "worksheet" as const,
  language: "kz" as const,
  title: "Ақпарат түрлері",
  intro: "Ақпаратты ұсыну тәсілдерін анықтап, мысалдармен сәйкестендір.",
  metaLine: "Күні: __________   Оқушының аты-жөні: ____________________________",
  tasks: [
    {
      type: "sort" as const,
      prompt: "Суреттерді қарап, ақпарат түрлеріне қарай топтастыр.",
      criterion: "Ақпарат түрлерін ажыратады",
      descriptor: "Мысалдар тиісті топқа бөлінген",
      points: 4,
      groups: ["Мәтіндік", "Графикалық"] as [string, string],
      items: ["Мақала", "Фотосурет", "Хабарландыру", "Сызба", "Ертегі", "Карта", "Мәтіндік хабар", "Диаграмма"],
      expectedAnswer: "Мәтіндік: мақала, хабарландыру, ертегі, мәтіндік хабар. Графикалық: фотосурет, сызба, карта, диаграмма.",
    },
    {
      type: "match" as const,
      prompt: "Файл атауын ақпарат түрімен сәйкестендір.",
      criterion: "Файл кеңейтімі бойынша ақпарат түрін анықтайды",
      descriptor: "Барлық файл атауы дұрыс сәйкестендірілген",
      points: 3,
      options: ["nature.jpg", "song.mp3", "story.txt"],
      pairs: ["Дыбыстық", "Мәтіндік", "Графикалық"],
      expectedAnswer: "1 — Графикалық; 2 — Дыбыстық; 3 — Мәтіндік.",
    },
    {
      type: "open" as const,
      prompt: "Күнделікті өмірден әртүрлі ақпарат түріне екі мысал жазып, олардың айырмашылығын түсіндір.",
      criterion: "Ақпарат түрлерін нақты мысалмен түсіндіреді",
      descriptor: "Екі мысал келтіріп, айырмашылығын сипаттайды",
      points: 3,
      expectedAnswer: "Жауап мысалдардың ақпарат түрін дұрыс ажыратады.",
    },
  ],
};

const buffer = await buildHandoutDocx(sample);
writeFileSync(".tmp-docx-qa/sample-kz.docx", buffer);
