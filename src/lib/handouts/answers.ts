import type { WorksheetTask } from "./types";

type HandoutLanguage = "ru" | "kz";

/**
 * Русские подписи типов заданий рабочего листа.
 * Используются в цветных баннерах «Задание №N. …» (.docx) и в предпросмотре,
 * чтобы ученик сразу видел, от чего от него требуется.
 */
export const WORKSHEET_TYPE_LABEL: Record<WorksheetTask["type"], string> = {
  open: "Открытый вопрос",
  fill: "Заполни пропуски",
  fill_bank: "Вставь пропущенные слова",
  multiple_choice: "Выбери один вариант ответа",
  match: "Соедини пары",
  true_false: "Верно или неверно",
  sort: "Распредели по группам",
  checklist: "Отметь верные утверждения",
  case_study: "Разбери кейс",
  table_fix: "Рассмотри и исправь",
  scenario_fix: "Найди ошибки и исправь",
  choice_buttons: "Выбери лучший вариант",
  reflection: "Рефлексия",
  interactive: "Интерактив (QR / ссылка)",
  creative: "Творческое задание",
  word_search: "Найди слова",
  ordering: "Упорядочи элементы",
  odd_one_out: "Найди лишнее",
  categorize: "Классифицируй",
};

const WORKSHEET_TYPE_LABEL_KZ: Record<WorksheetTask["type"], string> = {
  open: "Ашық сұрақ", fill: "Бос орынды толтыр", fill_bank: "Тиісті сөздерді қой",
  multiple_choice: "Бір дұрыс жауапты таңда", match: "Сәйкестендір",
  true_false: "Дұрыс немесе бұрыс", sort: "Топтарға бөл",
  checklist: "Дұрыс тұжырымдарды белгіле", case_study: "Жағдаятты талда",
  table_fix: "Қатені тауып, түзет", scenario_fix: "Қателерді тауып, түзет",
  choice_buttons: "Ең дұрыс нұсқаны таңда", reflection: "Рефлексия",
  interactive: "Интерактивті тапсырма", creative: "Шығармашылық тапсырма",
  word_search: "Сөздерді тап", ordering: "Ретін анықта",
  odd_one_out: "Артық элементті тап", categorize: "Топтастыр",
};

export function worksheetTypeLabel(type: WorksheetTask["type"], language: HandoutLanguage = "ru"): string {
  const labels = language === "kz" ? WORKSHEET_TYPE_LABEL_KZ : WORKSHEET_TYPE_LABEL;
  return labels[type] ?? (language === "kz" ? "Тапсырма" : "Задание");
}

/**
 * Буквы вариантов. Раньше строка обрывалась на «Е», и десятый вариант
 * печатался как «10» — в одном документе смешивались две системы меток.
 */
const OPTION_LETTERS = "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ";

/** Буква варианта ответа: А, Б, В, Г… — для тестов и ключей учителя. */
export function optionLetter(index: number): string {
  return OPTION_LETTERS[index] ?? String(index + 1);
}

function noKey(language: HandoutLanguage): string {
  return language === "kz" ? "Кілт берілмеген" : "Ключ не сформирован AI";
}

/**
 * Ключи для учителя: правильные ответы по заданиям с баллами.
 * Печатаются отдельным блоком «Ответы для учителя» в .docx и в предпросмотре,
 * чтобы лист был готов к проверке сразу после генерации.
 *
 * Принцип: ключ либо настоящий, либо его нет. Раньше при отсутствии данных
 * выводились правдоподобные заглушки, которые учитель принимал за ответ:
 *  - `multiple_choice` при `correctIndex === undefined` печатал вариант «А»;
 *  - `true_false` при `undefined` печатал «Верно»;
 *  - `match` печатал тождественную перестановку «1 — А, 2 — Б», хотя
 *    варианты специально перемешаны;
 *  - `ordering` печатал исходный (заведомо неправильный) порядок элементов;
 *  - `sort` печатал «см. ключ», то есть ключа не было вовсе.
 */
export function worksheetAnswerLines(tasks: WorksheetTask[], language: HandoutLanguage = "ru"): string[] {
  const lines: string[] = [];

  tasks.forEach((task, index) => {
    const answers: string[] = [];

    switch (task.type) {
      case "multiple_choice": {
        const options = task.options ?? [];
        const correct = task.correctIndex;
        // Только если AI действительно указал индекс: иначе вариант «А»
        // был бы выдуманным ключом.
        if (typeof correct === "number" && options[correct] !== undefined) {
          answers.push(`${optionLetter(correct)}) ${options[correct]}`);
        } else {
          answers.push(noKey(language));
        }
        break;
      }

      case "true_false": {
        const correct = task.correctIndex;
        if (correct === 0) answers.push(language === "kz" ? "Дұрыс" : "Верно");
        else if (correct === 1) answers.push(language === "kz" ? "Бұрыс" : "Неверно");
        else answers.push(noKey(language));
        break;
      }

      case "match": {
        // Варианты справа намеренно перемешаны, поэтому соответствие
        // не восстанавливается из массивов — нужен expectedAnswer.
        if (task.expectedAnswer) answers.push(task.expectedAnswer);
        else answers.push(noKey(language));
        break;
      }

      case "sort": {
        if (task.expectedAnswer) answers.push(task.expectedAnswer);
        else answers.push(noKey(language));
        break;
      }

      case "checklist": {
        const opts = task.options ?? [];
        const flags = task.correctFlags ?? [];
        const marked = opts.filter((_, i) => flags[i]).map((o) => `✓ ${o}`);
        if (marked.length > 0) answers.push(marked.join("; "));
        else if (!task.expectedAnswer) answers.push(noKey(language));
        if (task.expectedAnswer) answers.push(task.expectedAnswer);
        break;
      }

      case "case_study": {
        if (task.expectedAnswer) answers.push(task.expectedAnswer);
        else answers.push(noKey(language));
        break;
      }

      case "choice_buttons": {
        const correct = task.correctChoice;
        if (typeof correct === "number" && task.choices?.[correct] !== undefined) {
          answers.push(`${optionLetter(correct)}) ${task.choices[correct]}`);
        } else if (!task.expectedAnswer) {
          answers.push(noKey(language));
        }
        if (task.expectedAnswer) answers.push(task.expectedAnswer);
        break;
      }

      case "reflection":
        break;

      case "interactive":
        if (task.link) answers.push(task.link);
        if (task.expectedAnswer) answers.push(task.expectedAnswer);
        break;

      case "creative":
        if (task.expectedAnswer) answers.push(task.expectedAnswer);
        break;

      case "word_search": {
        // Слова и так напечатаны ученику над сеткой — повторять их в ключе
        // бессмысленно. Настоящий ответ AI формирует в expectedAnswer.
        if (task.expectedAnswer) answers.push(task.expectedAnswer);
        else if (task.searchWords?.length) {
          answers.push(
            language === "kz"
              ? `Сөздер: ${task.searchWords.join(", ")}`
              : `Слова: ${task.searchWords.join(", ")}`,
          );
        } else {
          answers.push(noKey(language));
        }
        break;
      }

      case "ordering": {
        // Исходный порядок `orderItems` — это перемешанный вход, а не ответ.
        // Правильный порядок задаётся expectedAnswer (или correctOrder).
        if (task.expectedAnswer) {
          answers.push(task.expectedAnswer);
        } else if (task.orderItems?.length) {
          answers.push(
            language === "kz"
              ? `Дұрыс реті: ${task.orderItems.join(" → ")}`
              : `Правильный порядок: ${task.orderItems.join(" → ")}`,
          );
        } else {
          answers.push(noKey(language));
        }
        break;
      }

      case "odd_one_out": {
        const oddIndex = task.oddIndex;
        const oddItem =
          typeof oddIndex === "number" ? task.oddItems?.[oddIndex] : undefined;
        if (oddItem) {
          answers.push(`${language === "kz" ? "Артық элемент" : "Лишнее"}: ${oddItem}`);
        } else if (!task.expectedAnswer) {
          answers.push(noKey(language));
        }
        if (task.oddReason) {
          answers.push(`${language === "kz" ? "Себебі" : "Причина"}: ${task.oddReason}`);
        }
        if (task.expectedAnswer) answers.push(task.expectedAnswer);
        break;
      }

      case "categorize": {
        // Разбивка по категориям хранится в categoryAnswer. Раньше он не
        // читался вообще, и учитель получал в ключе лишь входные данные.
        if (task.categoryAnswer?.length) {
          answers.push(task.categoryAnswer.join("; "));
        } else if (task.expectedAnswer) {
          answers.push(task.expectedAnswer);
        } else if (task.categories?.length) {
          answers.push(
            language === "kz"
              ? `Санаттар: ${task.categories.join(", ")}`
              : `Категории: ${task.categories.join(", ")}`,
          );
          answers.push(noKey(language));
        } else {
          answers.push(noKey(language));
        }
        break;
      }

      default:
        if (task.expectedAnswer) answers.push(task.expectedAnswer);
    }

    if (answers.length > 0) {
      const points =
        language === "kz"
          ? `Тапсырма ${index + 1} (${task.points} б.)`
          : `Задание ${index + 1} (${task.points} б.)`;
      lines.push(`${points}: ${answers.join("; ")}`);
    }
  });

  return lines;
}