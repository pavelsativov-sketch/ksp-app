import 'dotenv/config';
import { generateKsp } from './src/lib/ai/generate';
import { generateTasks } from './src/lib/ai/tasks';

async function main() {
  console.log("=== ТЕСТ 1: КСП по Информатике (9 класс) ===");
  try {
    const ksp1 = await generateKsp({
      topic: "Алгоритмы сортировки и поиска",
      grade: 9,
      subject: "Информатика",
      language: "ru",
    });
    console.log("Успех! Тема:", ksp1.topic);
    console.log("Целей:", ksp1.lessonObjectives?.length);
    console.log("Этапов:", Object.keys(ksp1.stages || {}).length);

    console.log("Генерация заданий для Информатики...");
    const tasks1 = await generateTasks({
      topic: "Алгоритмы сортировки и поиска",
      grade: 9,
      subject: "Информатика",
      stage: "middle",
      language: "ru",
      count: 3
    });
    console.log("Успех! Сгенерировано заданий:", tasks1.length);
    console.log("Типы заданий:", tasks1.map(t => t.type).join(", "));
  } catch (err: any) {
    console.error("Ошибка в тесте 1:", err.message);
  }

  console.log("\n=== ТЕСТ 2: КСП по Биологии (7 класс) ===");
  try {
    const ksp2 = await generateKsp({
      topic: "Многообразие растений",
      grade: 7,
      subject: "Биология",
      language: "ru",
    });
    console.log("Успех! Тема:", ksp2.topic);
    console.log("Вывод для рефлексии:", ksp2.stages?.end?.summary?.substring(0, 50) + "...");
    
    console.log("Генерация заданий для Биологии...");
    const tasks2 = await generateTasks({
      topic: "Многообразие растений",
      grade: 7,
      subject: "Биология",
      stage: "end",
      language: "ru",
      count: 2
    });
    console.log("Успех! Сгенерировано заданий:", tasks2.length);
    console.log("Типы заданий:", tasks2.map(t => t.type).join(", "));
  } catch (err: any) {
    console.error("Ошибка в тесте 2:", err.message);
  }
}

main();
