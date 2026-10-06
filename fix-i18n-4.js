const fs = require("fs");
if (fs.existsSync("src/lib/i18n/dictionaries.ts")) {
  let text = fs.readFileSync("src/lib/i18n/dictionaries.ts", "utf8");
  
  const schoolKey = `
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
  },`;

  text = text.replace(/const ru = \{/, 'const ru = {' + schoolKey);
  text = text.replace(/const kk: Dict = \{/, 'const kk: Dict = {' + schoolKey);
  
  // also add it to Dict type
  text = text.replace(/export type Dict = \{/, 'export type Dict = { school: any;');
  
  fs.writeFileSync("src/lib/i18n/dictionaries.ts", text);
}