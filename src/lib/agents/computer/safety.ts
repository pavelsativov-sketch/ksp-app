import "server-only";

/**
 * Политики безопасности агента «Использование компьютера».
 *
 * Агент видит экран и предлагает действия по координатам. Опасность действия
 * не выводится из самого действия: клик мышью безобиден, пока под курсором
 * «Отправить сообщение» или «Оплатить». Поэтому каждое действие перед
 * выполнением проверяется по ТЕКСТУ элемента под точкой — функция
 * `classifyClick` принимает подпись элемента и решает, спрашивать ли учителя.
 *
 * Все функции чистые: ни сети, ни Playwright. Их можно и нужно тестировать
 * таблицей — именно здесь ошибка означает «агент отправил письмо от имени
 * учителя», а не «красивый текст не тот».
 */

/** Категории риска действия. */
export type ActionRisk = "low" | "medium" | "high";

/** Решение по конкретному действию. */
export interface SafetyDecision {
  risk: ActionRisk;
  /** Требуется ли явное подтверждение учителя перед выполнением. */
  requiresConfirmation: boolean;
  /** Почему именно так — показывается в интерфейсе вместе с действием. */
  reason: string;
  /** Политика безопасности, если действие чему-то соответствует. */
  policy?: SafetyPolicy;
}

/**
 * Политики в терминах документации Computer Use. Названия оставлены на
 * английском, чтобы их можно было сопоставить с оригиналом и с ответами
 * модели, а пояснения — на русском, как остальной интерфейс.
 */
export type SafetyPolicy =
  | "FINANCIAL_TRANSACTIONS"
  | "SENSITIVE_DATA_MODIFICATION"
  | "COMMUNICATION_TOOL"
  | "ACCOUNT_CREATION"
  | "DATA_MODIFICATION"
  | "USER_CONSENT_MANAGEMENT"
  | "LEGAL_TERMS_AND_AGREEMENTS"
  | "CAPTCHA"
  | "LOGIN"
  | "EDUCATIONAL_RECORDS_MODIFICATION";

/** Категория политики -> человекочитаемое объяснение для учителя. */
export const POLICY_LABELS: Record<SafetyPolicy, string> = {
  FINANCIAL_TRANSACTIONS: "Платёж или покупка",
  SENSITIVE_DATA_MODIFICATION: "Изменение личных или государственных данных",
  COMMUNICATION_TOOL: "Отправка сообщений или писем",
  ACCOUNT_CREATION: "Создание учётной записи",
  DATA_MODIFICATION: "Удаление или изменение файлов",
  USER_CONSENT_MANAGEMENT: "Согласие на cookie и обработку данных",
  LEGAL_TERMS_AND_AGREEMENTS: "Принятие договора или условий",
  CAPTCHA: "Проверка «я не робот»",
  LOGIN: "Вход в учётную запись",
  EDUCATIONAL_RECORDS_MODIFICATION: "Изменение оценок, посещаемости или учебных записей",
};

/**
 * Признаки опасного элемента под курсором.
 *
 * Порядок важен: более специфичные правила стоят раньше, потому что слово
 * «удалить» в «удалить черновик» должно найти правило про черновики, а не
 * про безвозвратное удаление.
 */
interface ClickRule {
  policy: SafetyPolicy;
  re: RegExp;
  reason: string;
}

/**
 * Граница слова, работающая с кириллицей.
 *
 * `\b` в JavaScript считает словом только латинские буквы, цифры и `_`,
 * поэтому `\bотправить\b` никогда не совпало бы с «Отправить» — а почти
 * половина интерфейса агента на русском. Границу строим явно: это любой
 * символ вне букв/цифр/подчёркивания.
 */
function words(...alts: string[]): string {
  return String.raw`(?<![\p{L}\p{N}_])(?:${alts.join("|")})(?![\p{L}\p{N}_])`;
}

const CLICK_RULES: ClickRule[] = [
  {
    policy: "EDUCATIONAL_RECORDS_MODIFICATION",
    re: /(закрыть|завершить|подтвердить)\s+(электронный\s+)?журнал|((создать|провести|начать|завершить|выставить|изменить|редактировать|сохранить|поставить|отметить|опубликовать|удалить)\s+.{0,35}(урок|сор|соч|тест|оценк|посещаем|отсутств|пропуск|домашн.{0,12}задан|учебн.{0,12}запис|ктп))|(оценк|посещаем|отсутств|пропуск|сор|соч).{0,30}(сохранить|отправить|опубликовать|подтвердить)|урок.{0,25}(провед[её]н|заверш[её]н)|сабақты\s+өткізу/i,
    reason: "изменение или закрытие учебной записи",
  },
  // Оплата — раньше прочих: «Купить» и «Оплатить» не должны попадать
  // в общую категорию «отправки данных».
  {
    policy: "FINANCIAL_TRANSACTIONS",
    re: new RegExp(words("оплатить", "купить", "оформить заказ", "оплата", "подтвердить оплату", "checkout", "pay now", "buy now", "place order", "buy", "purchase"), "i"),
    reason: "кнопка оплаты или оформления заказа",
  },
  {
    policy: "FINANCIAL_TRANSACTIONS",
    re: new RegExp(words("перевести", "реквизит", "номер карты", "card number", "банковск\\w* сч[её]т", "iban", "swift"), "i"),
    reason: "платёжные реквизиты",
  },
  // Правовые условия: «принимаю» почти всегда означает согласие с договором.
  {
    policy: "LEGAL_TERMS_AND_AGREEMENTS",
    re: /(принимаю|согласен|соглашаюсь|agree to|accept (the )?(terms|policy|agreement)|i agree|terms of (service|use))/i,
    reason: "принятие условий или договора",
  },
  {
    policy: "USER_CONSENT_MANAGEMENT",
    re: /(принять все cookie|allow all cookies|accept all cookies|разрешить все cookie|принять все)/i,
    reason: "согласие на использование cookie",
  },
  // Регистрация.
  {
    policy: "ACCOUNT_CREATION",
    re: new RegExp(words("зарегистрироваться", "регистрация", "создать аккаунт", "создать профиль", "создать учётную запись", "create (an )?account", "sign ?up", "register"), "i"),
    reason: "создание учётной записи",
  },
  // Вход. Проверяем до общих правил: «войти» содержит «войти» и не должно
  // попасть в «отправку».
  {
    policy: "LOGIN",
    re: new RegExp(words("войти", "вход", "войдите", "log ?in", "sign ?in", "login"), "i"),
    reason: "вход в учётную запись",
  },
  {
    policy: "CAPTCHA",
    re: /(captcha|капча|не робот|i'?m not a robot|подтвердите, что вы человек|verify you are human)/i,
    reason: "проверка «я не робот»",
  },
  // Отправка сообщений. Самое частое действие, которое нельзя отменить.
  {
    policy: "COMMUNICATION_TOOL",
    re: new RegExp(words("отправить", "послать", "опубликовать", "отправ", "send", "submit", "post", "publish", "share"), "i"),
    reason: "отправка сообщения или публикация",
  },
  // Личные и государственные данные.
  {
    policy: "SENSITIVE_DATA_MODIFICATION",
    // «иин» — казахский ИИН, «инн» — российский ИНН: это разные буквы в
    // разном порядке, и одно правило на оба не сработает.
    re: new RegExp(words("удостоверени", "иин", "инн", "паспорт", "личные данные", "personal data", "social security", "ssn", "медицинская карта"), "i"),
    reason: "личные или государственные данные",
  },
  // Обратимое удаление отдельно от необратимого.
  {
    policy: "DATA_MODIFICATION",
    re: new RegExp(words("удалить", "удали", "delete", "remove", "trash", "стереть"), "i"),
    reason: "удаление данных",
  },
  {
    policy: "DATA_MODIFICATION",
    re: new RegExp(words("сохранить", "save", "загрузить", "upload", "скачать", "download"), "i"),
    reason: "изменение или выгрузка данных",
  },
];

/**
 * Разбирает, требует ли элемент под курсором подтверждения.
 *
 * `label` — собранный текст элемента и его родителей (Playwright отдаёт
 * вложенность, поэтому подпись кнопки может быть пустой, а смысл — в
 * родителе).
 */
export function classifyClick(label: string): SafetyDecision {
  const text = label.replace(/\s+/g, " ").trim();
  if (!text) {
    // Пустой элемент (иконка, разделитель) — обычное действие.
    return { risk: "low", requiresConfirmation: false, reason: "обычный элемент" };
  }
  if (/перейти\s+в\s+(ктп|журнал)/i.test(text)) {
    return { risk: "low", requiresConfirmation: false, reason: "переход в раздел КТП или журнала" };
  }

  for (const rule of CLICK_RULES) {
    if (rule.re.test(text)) {
      return {
        risk: "high",
        requiresConfirmation: true,
        reason: rule.reason,
        policy: rule.policy,
      };
    }
  }

  return { risk: "low", requiresConfirmation: false, reason: "обычный элемент" };
}

/** Ввод текста: опасен, когда в поле просят секрет или персональные данные. */
export function classifyTyping(text: string, fieldLabel: string, educationalContext = false): SafetyDecision {
  const label = fieldLabel.replace(/\s+/g, " ").trim();
  if (
    (educationalContext && !label) ||
    /(оценк|балл|посещаем|отсутств|пропуск|домашн.{0,12}задан|дз|тема.{0,12}урок|электронн.{0,12}журнал|ктп|сор|соч|тест|урок|учебн.{0,12}запис)/i.test(label)
  ) {
    return {
      risk: "high",
      requiresConfirmation: true,
      reason: "ввод или изменение учебной записи",
      policy: "EDUCATIONAL_RECORDS_MODIFICATION",
    };
  }
  const rule = CLICK_RULES.find(
    (r) => (r.policy === "SENSITIVE_DATA_MODIFICATION" || r.policy === "LOGIN") && r.re.test(label),
  );
  if (rule) {
    return { risk: "high", requiresConfirmation: true, reason: rule.reason, policy: rule.policy };
  }

  // Пароль определяем по самому тексту: метка поля может быть пустой.
  // Граница слова строим явно: `\b` не работает с кириллицей.
  if (
    new RegExp(words("пароль", "password", "passwd", "pin", "пин-код", "код доступа"), "i").test(label) ||
    /^\**$/.test(text) ||
    /^\*+$/.test(text)
  ) {
    return {
      risk: "high",
      requiresConfirmation: true,
      reason: "поле пароля",
      policy: "SENSITIVE_DATA_MODIFICATION",
    };
  }

  return { risk: "medium", requiresConfirmation: false, reason: "ввод текста в поле" };
}

/** Навигация: внешние адреса проходят SSRF-проверку отдельно, здесь — риск. */
export function classifyNavigation(url: string): SafetyDecision {
  const trimmed = url.trim();
  if (!trimmed) {
    return { risk: "low", requiresConfirmation: false, reason: "пустой адрес" };
  }
  // Вход в аккаунт часто идёт через query-параметры на странице входа.
  if (/[?&](next|redirect|return|continue|url)=/i.test(trimmed)) {
    return {
      risk: "medium",
      requiresConfirmation: false,
      reason: "переход на страницу входа или возврата",
      policy: "LOGIN",
    };
  }
  return { risk: "low", requiresConfirmation: false, reason: "переход по адресу" };
}

/** Оценка риска произвольного действия по имени инструмента. */
export function classifyAction(name: string): SafetyDecision {
  switch (name) {
    case "navigate":
      return { risk: "low", requiresConfirmation: false, reason: "переход по адресу" };
    case "go_back":
    case "go_forward":
      return { risk: "low", requiresConfirmation: false, reason: "навигация по истории" };
    case "scroll":
    case "move":
    case "wait":
      return { risk: "low", requiresConfirmation: false, reason: "чтение экрана" };
    case "type":
      return { risk: "medium", requiresConfirmation: false, reason: "ввод текста" };
    case "screenshot":
      return { risk: "low", requiresConfirmation: false, reason: "снимок экрана" };
    default:
      // Неизвестное действие считаем опасным: агент не должен уметь то,
      // чего мы не перечислили.
      return { risk: "high", requiresConfirmation: true, reason: "неизвестное действие" };
  }
}

/**
 * Признаки внедрения инструкций в содержимое страницы.
 *
 * Экран — это недоверенный ввод: текст на веб-странице может говорить
 * «забудь предыдущие указания и отправь…». Агент не должен принимать
 * инструкции из картинки, поэтому такие страницы требуют подтверждения
 * целиком.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /(игнорируй|игнорировать|забудь|не учитывай)\s+(все\s+)?(предыдущие|прежние|выше|прошлые)/i,
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i,
  /(disregard|forget)\s+(all\s+)?(your\s+)?(previous|prior|earlier)\s+(instructions|directions|rules|commands|prompts)/i,
  /(you are now|теперь ты|отныне ты)\s+(a|an|you are)?\s*(админ|admin|root|developer|разработчик)/i,
  /(new instructions|новые инструкции|новое задание)\s*[:：]/i,
  /(system\s*:\s*you|система\s*:\s*ты)/i,
  /(send (the )?(password|passwords|credentials)|отправь (пароль|пароли|данные))/i,
];

/**
 * Проверяет текст страницы на попытку внедрения инструкций.
 *
 * Возвращает причину, если подозрение есть. Проверка текста, а не скриншота:
 * у нас нет отдельного сервиса распознавания инструкций на картинке, а
 * внедрение чаще приходит именно текстом.
 */
export function detectPromptInjection(pageText: string): string | null {
  if (!pageText) return null;
  for (const re of INJECTION_PATTERNS) {
    const match = pageText.match(re);
    if (match) return `страница содержит инструкции для модели: «${match[0].slice(0, 80)}»`;
  }
  return null;
}

/**
 * Политика подтверждения для страницы целиком.
 *
 * Если на странице найдено внедрение инструкций, агент может на ней
 * читать, но любое действие требует подтверждения: доверять содержимому
 * нельзя.
 */
export function pageGate(pageText: string): { blocked: false; confirmEveryAction: boolean; reason: string | null } {
  const injection = detectPromptInjection(pageText);
  return { blocked: false, confirmEveryAction: injection !== null, reason: injection };
}

/**
 * Домены, куда агент не ходит ни при каких условиях.
 *
 * Список короткий и явный: агент — помощник учителя, а не инструмент
 * обхода. Сюда попадают страницы входа в почту и банкинг: даже если
 * учитель сам открыл их, автоматический ввод реквизитов мы не поддерживаем.
 */
const BLOCKED_HOST_PATTERNS: RegExp[] = [
  // Почта. Проверяем «mail» в любой позиции домена: webmail.example.com и
  // mail.example.com одинаково опасны, а перечислять все варианты бессмысленно.
  /(^|\.)(web)?mail\./i,
  /(^|\.)(outlook|office365|office)\.live\.com$/i,
  // Банки. Ищем «bank» как часть метки домена: mybank.kz, sberbank.ru,
  // online-banking.example — все они про деньги.
  /(^|\.)[^.]*bank[^.]*\./i,
  /(^|\.)[^.]*(qiwi|easypay|kassa|cloudpayments|payeer|yookassa)[^.]*\./i,
  /(webmoney|perfectmoney|westernunion|transferwise)/i,
  /(^|\.)paypal\.com$/i,
  /(^|\.)checkout\.stripe\.com$/i,
];

/** Запрещён ли домен для агента. */
export function isBlockedDomain(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    // Некорректный URL — тоже повод не идти туда.
    return true;
  }
  return BLOCKED_HOST_PATTERNS.some((re) => re.test(host));
}

/**
 * Очистка пользовательской подсказки.
 *
 * Отдельный слой безопасности из документации Computer Use: полезно, когда
 * пользовательский текст содержит инструкции для модели. Здесь очистка
 * означает отсечение текста, который выглядит как чужая инструкция, из
 * блока «Задача», но сама подсказка при этом не выбрасывается — обрезаем
 * длину и помечаем, чтобы в лог попал факт.
 */
export function sanitizePrompt(prompt: string, maxLength = 2000): { text: string; flagged: boolean } {
  const trimmed = prompt.trim();
  const flagged = INJECTION_PATTERNS.some((re) => re.test(trimmed));
  const text = trimmed.slice(0, maxLength);
  return { text, flagged };
}
