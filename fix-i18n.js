const fs = require('fs');
let content = fs.readFileSync('src/lib/i18n/dictionaries.ts', 'utf8');

// Fix ru referencing itself
content = content.replace(/school: ru\.school, planEditor: ru\.planEditor,/g, '');

// Since we deleted the school key from ru, let's append it manually to both ru and kk.
// First, find the end of ru (before 'const kk = {') and end of kk (before '};').
const schoolKey = \
  school: {
    nav: {
      home: 'Главная',
      analytics: 'Аналитика',
      attendance: 'Посещаемость',
      quality: 'Успеваемость',
      curriculum: 'Учебные программы',
      school: 'Школа',
      classes: 'Классы',
      teachers: 'Педагоги',
      students: 'Учащиеся',
      vsk: 'ВШК',
      ksp: 'КСП',
      agents: 'AI Agents',
      tasks: 'Задания',
      history: 'История',
      workspace: 'Workspace',
      connectors: 'Подключения',
      reports: 'Отчёты',
      settings: 'Настройки',
    },
    dashboard: {
      greeting: 'Добрый день',
      healthScore: 'Состояние школы',
      attendance: 'Посещаемость',
      quality: 'Качество знаний',
      curriculum: 'Учебные программы',
      vsk: 'ВШК',
      issues: 'Проблемы',
      warnings: 'Предупреждения',
      aiInsights: 'AI Insights',
      recentActivity: 'Последние события',
    },
    placeholder: {
      title: 'В разработке',
      description: 'Этот модуль находится в разработке и скоро будет доступен.',
    },
  },
\;

// We just append to the file before export const dictionaries
content = content.replace(/export const dictionaries/, schoolKey + '\nexport const dictionaries');
fs.writeFileSync('src/lib/i18n/dictionaries.ts', content);