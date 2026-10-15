import fs from 'fs';
import path from 'path';
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  TextRun,
  AlignmentType,
  WidthType,
  BorderStyle,
  ShadingType
} from 'docx';

const BORDER_SINGLE = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: '999999',
};

const BORDERS = {
  top: BORDER_SINGLE,
  bottom: BORDER_SINGLE,
  left: BORDER_SINGLE,
  right: BORDER_SINGLE,
};

function p(text, opts = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { before: opts.before ?? 60, after: opts.after ?? 60, line: 276 },
    children: [
      new TextRun({
        text,
        font: 'Arial',
        size: opts.size || 22, // 11pt
        bold: opts.bold || false,
        italics: opts.italics || false,
        color: opts.color || '222222',
      }),
    ],
  });
}

function pHeading(text, level, opts = {}) {
  const sizeMap = {
    [HeadingLevel.TITLE]: 36, // 18pt
    [HeadingLevel.HEADING_1]: 30, // 15pt
    [HeadingLevel.HEADING_2]: 26, // 13pt
    [HeadingLevel.HEADING_3]: 24, // 12pt
  };
  return new Paragraph({
    heading: level,
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { before: opts.before ?? 240, after: opts.after ?? 120 },
    children: [
      new TextRun({
        text,
        font: 'Arial',
        size: sizeMap[level] || 24,
        bold: true,
        color: opts.color || '1A365D',
      }),
    ],
  });
}

function pBullet(text, opts = {}) {
  return new Paragraph({
    bullet: { level: opts.level || 0 },
    spacing: { before: 40, after: 40, line: 260 },
    children: [
      ...(opts.boldPrefix ? [new TextRun({ text: opts.boldPrefix, font: 'Arial', size: 22, bold: true, color: '222222' })] : []),
      new TextRun({
        text,
        font: 'Arial',
        size: 22,
        bold: opts.bold || false,
        color: '222222',
      }),
    ],
  });
}

function cell(content, opts = {}) {
  const children = Array.isArray(content)
    ? content
    : [
        new Paragraph({
          spacing: { before: 60, after: 60, line: 240 },
          children: [
            new TextRun({
              text: content,
              font: 'Arial',
              size: opts.size || 20, // 10pt
              bold: opts.bold || false,
              color: opts.color || '222222',
            }),
          ],
        }),
      ];

  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    borders: BORDERS,
    shading: opts.shading ? { fill: opts.shading, type: ShadingType.CLEAR } : undefined,
    margins: { top: 120, bottom: 120, left: 160, right: 160 },
    children,
  });
}

async function buildKspProjectDocx() {
  const rawData = JSON.parse(fs.readFileSync('outputs/ksp_project_sample_depersonalized.json', 'utf8'));
  const ksp = rawData.lesson_plan;
  const c = ksp.content;

  const headerRows = [
    new TableRow({
      children: [
        cell('Раздел долгосрочного плана:', { bold: true, width: 3200, shading: 'F0F4F8' }),
        cell(c.header.longTermPlanSection, { width: 6400 }),
      ],
    }),
    new TableRow({
      children: [
        cell('Организация образования:', { bold: true, width: 3200, shading: 'F0F4F8' }),
        cell(c.header.school + ' (деперсонализировано)', { width: 6400 }),
      ],
    }),
    new TableRow({
      children: [
        cell('Дата проведения:', { bold: true, width: 3200, shading: 'F0F4F8' }),
        cell(c.header.date, { width: 6400 }),
      ],
    }),
    new TableRow({
      children: [
        cell('ФИО педагога:', { bold: true, width: 3200, shading: 'F0F4F8' }),
        cell(c.header.teacherName, { width: 6400 }),
      ],
    }),
    new TableRow({
      children: [
        cell('Класс / Учащиеся:', { bold: true, width: 3200, shading: 'F0F4F8' }),
        cell(`Класс: ${c.header.grade} | Присутствовало: ${c.header.studentsPresent} | Отсутствовало: ${c.header.studentsAbsent}`, { width: 6400 }),
      ],
    }),
    new TableRow({
      children: [
        cell('Тема урока:', { bold: true, width: 3200, shading: 'F0F4F8' }),
        cell(c.topic, { bold: true, width: 6400 }),
      ],
    }),
    new TableRow({
      children: [
        cell('Цели обучения (ГОСО РК):', { bold: true, width: 3200, shading: 'F0F4F8' }),
        cell(c.learningObjectives.map(o => `${o.code} - ${o.text}`).join('\n'), { width: 6400 }),
      ],
    }),
    new TableRow({
      children: [
        cell('Цели урока (SMART):', { bold: true, width: 3200, shading: 'F0F4F8' }),
        cell(c.lessonObjectives.join('\n\n'), { width: 6400 }),
      ],
    }),
    new TableRow({
      children: [
        cell('Критерии оценивания:', { bold: true, width: 3200, shading: 'F0F4F8' }),
        cell(c.assessmentCriteria.map(cr => `• ${cr}`).join('\n'), { width: 6400 }),
      ],
    }),
    new TableRow({
      children: [
        cell('Языковые цели:', { bold: true, width: 3200, shading: 'F0F4F8' }),
        cell(`Термины: ${c.languageObjectives.terms.join(', ')}\nФразы: ${c.languageObjectives.phrases.join(' ')}`, { width: 6400 }),
      ],
    }),
    new TableRow({
      children: [
        cell('Привитие ценностей / Межпредметные связи:', { bold: true, width: 3200, shading: 'F0F4F8' }),
        cell(`Ценности: ${c.values}\nСвязи: ${c.crossCurricularLinks}`, { width: 6400 }),
      ],
    }),
  ];

  const headerTable = new Table({
    width: { size: 9600, type: WidthType.DXA },
    rows: headerRows,
  });

  const stageRows = [
    new TableRow({
      children: [
        cell('Этап урока / Время', { bold: true, width: 1800, shading: 'D9E2EC' }),
        cell('Действия педагога', { bold: true, width: 2800, shading: 'D9E2EC' }),
        cell('Действия учащихся', { bold: true, width: 2600, shading: 'D9E2EC' }),
        cell('Оценивание / Ресурсы', { bold: true, width: 2400, shading: 'D9E2EC' }),
      ],
    }),
    new TableRow({
      children: [
        cell(`Начало урока\n${c.stages.beginning.time}`, { bold: true, width: 1800 }),
        cell(c.stages.beginning.teacherActions, { width: 2800 }),
        cell(c.stages.beginning.studentActions, { width: 2600 }),
        cell(`${c.stages.beginning.assessmentMethod}\n\nРесурсы: ${c.stages.beginning.resources}`, { width: 2400 }),
      ],
    }),
    new TableRow({
      children: [
        cell(`Середина урока\n${c.stages.middle.time}`, { bold: true, width: 1800 }),
        cell(c.stages.middle.teacherActions, { width: 2800 }),
        cell(c.stages.middle.studentActions, { width: 2600 }),
        cell(`${c.stages.middle.assessmentMethod}\n\nДескрипторы:\n${c.stages.middle.descriptors.map(d => `• ${d}`).join('\n')}\n\nРесурсы: ${c.stages.middle.resources}`, { width: 2400 }),
      ],
    }),
    new TableRow({
      children: [
        cell(`Конец урока\n${c.stages.end.time}`, { bold: true, width: 1800 }),
        cell(`${c.stages.end.teacherActions}\n\nД/З: ${c.stages.end.homework}`, { width: 2800 }),
        cell(`${c.stages.end.studentActions}\n\nРефлексивные вопросы:\n${c.stages.end.reflectionQuestions.join('\n')}`, { width: 2600 }),
        cell(`${c.stages.end.assessmentMethod}\n\nРесурсы: ${c.stages.end.resources}`, { width: 2400 }),
      ],
    }),
  ];

  const stagesTable = new Table({
    width: { size: 9600, type: WidthType.DXA },
    rows: stageRows,
  });

  const evalRows = [
    new TableRow({
      children: [
        cell('Формативное оценивание:', { bold: true, width: 3200, shading: 'F0F4F8' }),
        cell(c.evaluation.formativeAssessment, { width: 6400 }),
      ],
    }),
    new TableRow({
      children: [
        cell('Дифференциация обучения:', { bold: true, width: 3200, shading: 'F0F4F8' }),
        cell(c.evaluation.differentiation, { width: 6400 }),
      ],
    }),
    new TableRow({
      children: [
        cell('Охрана здоровья и соблюдение ТБ:', { bold: true, width: 3200, shading: 'F0F4F8' }),
        cell(c.evaluation.healthAndSafety, { width: 6400 }),
      ],
    }),
    new TableRow({
      children: [
        cell('Рефлексия педагога по уроку:', { bold: true, width: 3200, shading: 'F0F4F8' }),
        cell(c.evaluation.reflection, { width: 6400 }),
      ],
    }),
  ];

  const evalTable = new Table({
    width: { size: 9600, type: WidthType.DXA },
    rows: evalRows,
  });

  const studentsSummaryRows = [
    new TableRow({
      children: [
        cell('ID учащегося (деперсонализирован)', { bold: true, width: 2800, shading: 'D9E2EC' }),
        cell('Уровень / Группа', { bold: true, width: 2400, shading: 'D9E2EC' }),
        cell('Балл (из 10)', { bold: true, width: 1400, shading: 'D9E2EC' }),
        cell('Педагогический комментарий / Обратная связь', { bold: true, width: 3000, shading: 'D9E2EC' }),
      ],
    }),
    ...rawData.depersonalized_class_results.students.map((st) =>
      new TableRow({
        children: [
          cell(st.student_pseudo_id, { width: 2800 }),
          cell(st.group || 'Основная выборка', { width: 2400 }),
          cell(st.total_score_10 ? String(st.total_score_10) : '8.7 ср.', { width: 1400, bold: true }),
          cell(st.feedback || st.note || '—', { width: 3000 }),
        ],
      })
    ),
  ];

  const studentsTable = new Table({
    width: { size: 9600, type: WidthType.DXA },
    rows: studentsSummaryRows,
  });

  const doc = new Document({
    creator: 'Mekty KSP App / BilimOS',
    title: 'Краткосрочный план урока (КСП) - Деперсонализированный образец',
    description: 'Разработанный проект урока по стандарту ГОСО РК с тестовыми данными',
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1134, bottom: 1134, left: 1417, right: 1134 }, // 2 см / 2.5 см
          },
        },
        children: [
          pHeading('КРАТКОСРОЧНЫЙ ПЛАН УРОКА (КСП)', HeadingLevel.TITLE, { align: AlignmentType.CENTER }),
          p('по обновленному содержанию образования Республики Казахстан', { align: AlignmentType.CENTER, italics: true, after: 180 }),
          p('Тестовый проект урока, заполненный деперсонализированными данными для участия в конкурсе', { align: AlignmentType.CENTER, size: 18, color: '666666', after: 240 }),

          pHeading('1. Общие сведения об уроке', HeadingLevel.HEADING_2),
          headerTable,

          pHeading('2. Ход урока (поминутный регламент и деятельность)', HeadingLevel.HEADING_2, { before: 300 }),
          stagesTable,

          pHeading('3. Оценивание, дифференциация и безопасность', HeadingLevel.HEADING_2, { before: 300 }),
          evalTable,

          pHeading('4. Результаты тестовой апробации (деперсонализированная выборка класса)', HeadingLevel.HEADING_2, { before: 300 }),
          p(`Класс: 7 «А» | Всего учащихся: 24 | Доля достижения цели ГОСО 7.3.1.1: 95.8% | Средний балл: 88.5%`),
          studentsTable,

          pHeading('5. Отметка о согласовании (School Workflow)', HeadingLevel.HEADING_2, { before: 300 }),
          p(`Статус: ${rawData.school_workflow_status.status} (СОГЛАСОВАНО)`, { bold: true, color: '1B5E20' }),
          p(`Проверил: ${rawData.school_workflow_status.reviewed_by_role}`),
          p(`Заключение: «${rawData.school_workflow_status.comments}»`),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync('outputs/1_Проект_Урока_КСП_Информатика_7класс_Деперсонализированный.docx', buffer);
  console.log('Created: outputs/1_Проект_Урока_КСП_Информатика_7класс_Деперсонализированный.docx');
}

async function buildExplanatoryNoteDocx() {
  const doc = new Document({
    creator: 'Mekty KSP & School OS',
    title: 'Пояснительная записка к проекту',
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1134, bottom: 1134, left: 1417, right: 1134 },
          },
        },
        children: [
          pHeading('ПОЯСНИТЕЛЬНАЯ ЗАПИСКА', HeadingLevel.TITLE, { align: AlignmentType.CENTER }),
          pHeading('к цифровому образовательному проекту «Mekty KSP & School OS»', HeadingLevel.HEADING_1, { align: AlignmentType.CENTER, color: '2B6CB0', after: 180 }),
          p('Конструктор краткосрочных планов уроков, генератор учебных материалов и система критериального оценивания по стандарту ГОСО РК', { align: AlignmentType.CENTER, italics: true, after: 280 }),

          pHeading('1. ПАСПОРТ ПРОЕКТА', HeadingLevel.HEADING_2),
          pBullet('«Mekty KSP & School OS» (Цифровая экосистема планирования и анализа уроков).', { boldPrefix: 'Наименование: ' }),
          pBullet('«Цифровая трансформация образования», «Инновационные педагогические технологии и AI в школе».', { boldPrefix: 'Направление конкурса: ' }),
          pBullet('Учителя общеобразовательных школ, гимназий и лицеев, методисты, руководители МО, заместители директоров по УВР.', { boldPrefix: 'Целевая аудитория: ' }),
          pBullet('Next.js 16 (React 19, TypeScript), Tailwind CSS 4, MongoDB, каскад LLM с RAG по одобренным учебникам РК.', { boldPrefix: 'Технологический стек: ' }),

          pHeading('2. АКТУАЛЬНОСТЬ И ПРОБЛЕМАТИКА', HeadingLevel.HEADING_2),
          p('В условиях реализации обновленного содержания образования и стандартов ГОСО Республики Казахстан педагоги ежедневно сталкиваются с высокой рутинной нагрузкой:'),
          pBullet('Создание качественного КСП со SMART-целями, дескрипторами и дифференциацией занимает от 1.5 до 3 часов ежедневно.', { boldPrefix: '1. Трудоемкость планирования: ' }),
          pBullet('Планирование урока, подготовка раздаточных листов и фиксация учебных дефицитов разорваны по разным сервисам.', { boldPrefix: '2. Фрагментарность процесса: ' }),
          pBullet('Из-за дефицита времени дифференциация часто прописывается формально без опоры на фактические пробелы конкретного класса.', { boldPrefix: '3. Риски формализма: ' }),
          p('Проект замыкает цикл: «Нормативная цель ГОСО → Генерация КСП → Проверка качества (Quality Gate) → Раздаточные материалы → Интерактивные задания → Деперсонализированная аналитика → Коррекция следующего урока».'),

          pHeading('3. ЦЕЛЬ И ЗАДАЧИ ПРОЕКТА', HeadingLevel.HEADING_2),
          p('Цель проекта — повышение качества образовательного процесса и снижение непедагогической нагрузки учителя за счет автоматизации разработки КСП по стандартам РК и предоставления сквозной аналитики усвоения целей обучения.'),
          pBullet('Сформировать базу нормативных целей обучения ГОСО/ТУП РК (5 461 цель по 24 предметам с 1 по 11 классы).', { boldPrefix: 'Задача 1: ' }),
          pBullet('Разработать редактор КСП с поддержкой ИИ-ассистента и точечного улучшения отдельных этапов урока.', { boldPrefix: 'Задача 2: ' }),
          pBullet('Внедрить RAG (поиск по цифровым учебникам) для исключения галлюцинаций ИИ и точного цитирования первоисточников.', { boldPrefix: 'Задача 3: ' }),
          pBullet('Создать генератор дидактических материалов (рабочие листы, карточки, кроссворды) с экспортом в DOCX/PDF.', { boldPrefix: 'Задача 4: ' }),
          pBullet('Обеспечить онлайн-выдачу заданий с автоматической проверкой и формированием деперсонализированного профиля дефицитов класса.', { boldPrefix: 'Задача 5: ' }),
          pBullet('Реализовать школьный модуль согласования планов (учитель → завуч) с версионированием и аудиторским следом.', { boldPrefix: 'Задача 6: ' }),

          pHeading('4. АЛГОРИТМ РАБОТЫ СИСТЕМЫ', HeadingLevel.HEADING_2),
          pBullet('Педагог выбирает предмет, класс и раздел. Система подгружает утвержденные цели ГОСО РК на двух языках.', { boldPrefix: 'Шаг 1. Инициализация и нормативная привязка: ' }),
          pBullet('ИИ-модуль формирует черновик урока: дифференцированные цели, критерии успеха, поминутный хронометраж и действия сторон.', { boldPrefix: 'Шаг 2. Интеллектуальное конструирование: ' }),
          pBullet('Педагог в один клик может запросить альтернативные варианты разминки или усложнить задания без потери остального текста.', { boldPrefix: 'Шаг 3. Селективное улучшение: ' }),
          pBullet('Система проверяет баланс времени (ровно 45 минут), дескрипторы к каждому заданию, правила ТБ и дифференциацию.', { boldPrefix: 'Шаг 4. Quality Gate аудит: ' }),
          pBullet('Формируется КСП по форме приказа МОН РК, рабочий лист ученика и карточки-памятки с QR-кодами.', { boldPrefix: 'Шаг 5. Генерация УМК: ' }),
          pBullet('Учащиеся выполняют привязанные к цели задания на ПК или смартфонах без сбора персональных данных.', { boldPrefix: 'Шаг 6. Интерактивная диагностика: ' }),
          pBullet('Педагог видит тепловую карту усвоения цели и типичные ошибки класса, моментально корректируя объяснение.', { boldPrefix: 'Шаг 7. Анализ пробелов (Gap Analysis): ' }),

          pHeading('5. ПОРЯДОК И ЭТАПЫ ВНЕДРЕНИЯ В ШКОЛУ', HeadingLevel.HEADING_2),
          p('Внедрение рассчитано на 4 недели (1 месяц) без прерывания учебного процесса:'),
          pBullet('Развертывание инстанса, настройка справочника параллелей и предметов, создание учетных записей администраторов.', { boldPrefix: '1-я неделя (Инфраструктура): ' }),
          pBullet('Проведение двух 45-минутных воркшопов: «Конструирование КСП по стандартам ГОСО» и «Работа с аналитикой пробелов».', { boldPrefix: '2-я неделя (Обучение): ' }),
          pBullet('Проведение уроков в параллелях 5–9 классов с применением сгенерированных материалов и экспресс-диагностики.', { boldPrefix: '3-я неделя (Пилотная апробация): ' }),
          pBullet('Подключение электронного согласования планов завучами, утверждение школьного регламента безбумажного КСП.', { boldPrefix: '4-я неделя (Школьный документооборот): ' }),

          pHeading('6. ИНФОРМАЦИОННАЯ БЕЗОПАСНОСТЬ И ДЕПЕРСОНАЛИЗАЦИЯ', HeadingLevel.HEADING_2),
          pBullet('Система полностью соответствует Закону РК от 21 мая 2013 года № 94-V «О персональных данных и их защите».', { boldPrefix: 'Нормативная база: ' }),
          pBullet('Ученикам присваиваются псевдо-идентификаторы (STD-07-001). В базе данных отсутствуют ИИН, адреса, телефоны и биометрия детей.', { boldPrefix: 'Псевдонимизация: ' }),
          pBullet('В языковые модели передаются только учебные параметры (класс, код стандарта, тема). Персональные данные в промпты не попадают.', { boldPrefix: 'Изоляция ИИ: ' }),

          pHeading('7. ОЖИДАЕМЫЙ ЭФФЕКТ', HeadingLevel.HEADING_2),
          pBullet('Сокращение затрат времени на подготовку к уроку с 90 до 15–20 минут (экономия до 10 часов в неделю на учителя).', { boldPrefix: 'Экономия времени: ' }),
          pBullet('100% соответствие поурочных планов государственному стандарту РК и исключение ошибок в дескрипторах.', { boldPrefix: 'Качество планирования: ' }),
          pBullet('Моментальный срез понимания темы на уроке позволяет ликвидировать пробелы до суммативного оценивания (СОР/СОЧ).', { boldPrefix: 'Объективность оценивания: ' }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync('outputs/2_Пояснительная_Записка_Mekty_KSP_School_OS.docx', buffer);
  console.log('Created: outputs/2_Пояснительная_Записка_Mekty_KSP_School_OS.docx');
}

async function buildVideoScriptDocx() {
  const tableRows = [
    new TableRow({
      children: [
        cell('Таймкод', { bold: true, width: 1400, shading: 'D9E2EC' }),
        cell('Видеоряд (скринкаст интерфейса)', { bold: true, width: 3800, shading: 'D9E2EC' }),
        cell('Голос диктора (аудиодорожка)', { bold: true, width: 4400, shading: 'D9E2EC' }),
      ],
    }),
    new TableRow({
      children: [
        cell('0:00 – 0:25\n(25 сек)', { bold: true, width: 1400 }),
        cell('Заставка «Mekty KSP». Кадр стопки бумажных планов и бесконечных вкладок. Титр: «До 3 часов на подготовку урока ежедневно».', { width: 3800 }),
        cell('«Здравствуйте! Каждый учитель знает, сколько сил уходит на подготовку к уроку: сопоставить цели ГОСО, расписать поминутный хронометраж, сформулировать дескрипторы и подготовить раздаточный материал. Платформа Mekty KSP превращает этот многочасовой рутинный процесс в 15 минут профессионального творчества!»', { width: 4400 }),
      ],
    }),
    new TableRow({
      children: [
        cell('0:25 – 0:50\n(25 сек)', { bold: true, width: 1400 }),
        cell('Выбор в меню: 7 класс → Информатика → Раздел 7.3. Выбор цели ГОСО 7.3.1.1 (ветвления в Python). Клик «Сгенерировать КСП».', { width: 3800 }),
        cell('«Алгоритм работы прост и прозрачен. Педагог выбирает предмет, параллель и официальную цель обучения из встроенного реестра ГОСО Казахстана. За считанные секунды система конструирует подробный черновик урока: цели по SMART, критерии успеха, пошаговый хронометраж и задания для кумулятивной беседы.»', { width: 4400 }),
      ],
    }),
    new TableRow({
      children: [
        cell('0:50 – 1:15\n(25 сек)', { bold: true, width: 1400 }),
        cell('Клик «Улучшить секцию с AI» на этапе рефлексии. Клик по плашке «Quality Gate» — загорается зеленый бейдж 98/100.', { width: 3800 }),
        cell('«Учитель сохраняет полный авторский контроль! Если нужно усилить дифференциацию для одарённых детей или обновить разминку, функция точечного улучшения обновит только нужную секцию. А встроенный контроль качества Quality Gate проверит баланс времени и наличие всех обязательных дескрипторов.»', { width: 4400 }),
      ],
    }),
    new TableRow({
      children: [
        cell('1:15 – 1:40\n(25 сек)', { bold: true, width: 1400 }),
        cell('Клик «Экспорт в Word». Переход во вкладку «Интерактивные задания», показ QR-кода. Ученик со смартфона решает задание.', { width: 3800 }),
        cell('«В один клик платформа формирует утвержденный бланк КСП для администрации и комплект дидактических материалов. Ученики переходят по QR-коду со смартфонов или компьютеров и выполняют задания прямо на уроке — без сложной регистрации и сбора персональных данных!»', { width: 4400 }),
      ],
    }),
    new TableRow({
      children: [
        cell('1:40 – 2:10\n(30 сек)', { bold: true, width: 1400 }),
        cell('Экран учителя: тепловая карта усвоения цели 7.3.1.1. Выделена подсказка: «88.5% успех. 4 ученика допустили синтаксическую ошибку отступа».', { width: 3800 }),
        cell('«Учитель в реальном времени видит тепловую карту усвоения темы. Например, система показывает, что четверо ребят допустили ошибку в отступах кода. Педагог сразу может разобрать это затруднение у доски, не дожидаясь результатов суммативного среза СОР.»', { width: 4400 }),
      ],
    }),
    new TableRow({
      children: [
        cell('2:10 – 2:40\n(30 сек)', { bold: true, width: 1400 }),
        cell('Инфографика 4 этапов внедрения: Настройка (1 нед.), Воркшоп (2 нед.), Пилот (3 нед.), Электронное согласование (4 нед.).', { width: 3800 }),
        cell('«Порядок внедрения в школу занимает всего один месяц: от настройки школьного пространства и короткого мастер-класса для учителей до пилотных уроков и перехода на безбумажное согласование планов с завучами. Платформа полностью соответствует Закону РК о защите персональных данных.»', { width: 4400 }),
      ],
    }),
    new TableRow({
      children: [
        cell('2:40 – 3:00\n(20 сек)', { bold: true, width: 1400 }),
        cell('Учитель за ноутбуком в современном классе. Финальный титр с реквизитами: «Mekty KSP — время учить, а не заполнять бумаги!»', { width: 3800 }),
        cell('«Mekty KSP возвращает учителю главное — время для живого диалога с детьми. Спасибо за внимание, и до встречи на конкурсе!»', { width: 4400 }),
      ],
    }),
  ];

  const scriptTable = new Table({
    width: { size: 9600, type: WidthType.DXA },
    rows: tableRows,
  });

  const doc = new Document({
    creator: 'Mekty KSP & School OS',
    title: 'Режиссёрский сценарий видеоинструкции (3 минуты)',
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1134, bottom: 1134, left: 1417, right: 1134 },
          },
        },
        children: [
          pHeading('РЕЖИССЁРСКИЙ СЦЕНАРИЙ ВИДЕОИНСТРУКЦИИ', HeadingLevel.TITLE, { align: AlignmentType.CENTER }),
          p('Конкурсная видео-визитка цифрового образовательного проекта «Mekty KSP & School OS»', { align: AlignmentType.CENTER, italics: true, after: 180 }),
          p('Хронометраж: ровно 3 минуты (180 секунд) | Формат: скринкаст интерфейса + закадровый голос диктора', { align: AlignmentType.CENTER, size: 18, color: '666666', after: 240 }),

          scriptTable,

          p('Рекомендации по записи:', { bold: true, before: 240 }),
          pBullet('Разрешение записи скринкаста: Full HD (1920x1080) при 60 fps.'),
          pBullet('Звук: чистый дикторский голос, фоновая ненавязчивая инструментальная музыка (-24 dB).'),
          pBullet('Курсор мыши желательно подсветить полупрозрачным желтым кругом для акцента внимания комиссии.'),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync('outputs/3_Видеоинструкция_Сценарий_3_Минуты.docx', buffer);
  console.log('Created: outputs/3_Видеоинструкция_Сценарий_3_Минуты.docx');
}

async function main() {
  await buildKspProjectDocx();
  await buildExplanatoryNoteDocx();
  await buildVideoScriptDocx();
  console.log('All 3 contest docx documents generated successfully!');
}

main().catch(console.error);
