import type { Locale } from "@/lib/i18n/dictionaries";

/** Ссылка для мгновенной отправки текста в WhatsApp (телефон и WhatsApp Web). */
export function buildWhatsAppUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Ссылка для мгновенной отправки ссылки и текста в Telegram. */
export function buildTelegramUrl(url: string, text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
}

export function homeworkShareMessage(opts: {
  title: string;
  url: string;
  code: string;
  daysValid?: number;
  locale?: Locale;
}): string {
  const { title, url, code, daysValid, locale = "ru" } = opts;
  if (locale === "kk") {
    const deadline = daysValid ? `\nОрындау мерзімі: ${daysValid} күн.` : "";
    return `Сәлеметсіздер ме! Үй тапсырмасы: «${title}».${deadline}\nСілтеме арқылы өтіп, аты-жөніңізді жазып орындаңыз: ${url}\nКод: ${code}`;
  }
  const deadline = daysValid ? `\nСрок выполнения: ${daysValid} дн.` : "";
  return `Здравствуйте! Домашнее задание: «${title}».${deadline}\nПерейдите по ссылке, укажите ФИО и выполните задания: ${url}\nКод задания: ${code}`;
}

export function quizShareMessage(opts: {
  title: string;
  url: string;
  code: string;
  locale?: Locale;
}): string {
  const { title, url, code, locale = "ru" } = opts;
  if (locale === "kk") {
    return `Интерактивті квизге қосылыңыз: «${title}»!\nСілтеме: ${url}\nКіру коды: ${code}`;
  }
  return `Присоединяйтесь к интерактивному квизу: «${title}»!\nСсылка: ${url}\nКод комнаты: ${code}`;
}

export function parentReportMessage(opts: {
  studentName: string;
  totalAssignments: number;
  average: number;
  best: number;
  worst: number;
  recentTitles: string[];
  locale?: Locale;
}): string {
  const { studentName, totalAssignments, average, best, worst, recentTitles, locale = "ru" } = opts;
  const recentLine = recentTitles.slice(0, 3).join("; ");
  if (locale === "kk") {
    const praise =
      average >= 85
        ? "Нәтижесі өте жақсы, еңбегі мен белсенділігі қуантады."
        : average >= 65
          ? "Нәтижесі жақсы, кейбір тақырыптарды қайталап бекіту пайдалы болады."
          : "Материалды қосымша қайталап, бірге бекітіп шығуды ұсынамын.";
    return [
      `Қайырлы күн! Оқушы ${studentName} бойынша қысқаша үлгерім есебі:`,
      `• Орындалған тапсырмалар: ${totalAssignments}`,
      `• Орташа нәтиже: ${average}% (ең жоғары: ${best}%, ең төмен: ${worst}%)`,
      ...(recentLine ? [`• Соңғы тапсырмалар: ${recentLine}`] : []),
      praise,
    ].join("\n");
  }
  const praise =
    average >= 85
      ? "Отличный результат, стабильная и уверенная работа!"
      : average >= 65
        ? "Хороший результат; полезно ещё немного закрепить отдельные темы."
        : "Рекомендуем дополнительно повторить пройденный материал вместе дома.";
  return [
    `Добрый день! Краткая сводка по успеваемости ученика ${studentName}:`,
    `• Выполнено заданий: ${totalAssignments}`,
    `• Средний результат: ${average}% (лучший: ${best}%, минимальный: ${worst}%)`,
    ...(recentLine ? [`• Недавние задания: ${recentLine}`] : []),
    praise,
  ].join("\n");
}
