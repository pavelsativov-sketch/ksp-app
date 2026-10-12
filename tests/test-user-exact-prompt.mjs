import { readFileSync } from 'fs';

const APP_URL = 'https://ksp-app-pi.vercel.app';
const OUT = 'tests/e2e-screenshots/';

async function testUserExactPrompt() {
  console.log('\n🚀 Тестирование точного запроса пользователя: "открой мне билим класс"...');
  
  let storageState;
  try {
    storageState = JSON.parse(readFileSync(`${OUT}session.json`, 'utf8'));
  } catch {}

  const cookie = storageState.cookies.map(c => c.name + '=' + c.value).join('; ');

  // 0. Check and stop any currently running task
  const checkRes = await fetch(`${APP_URL}/api/agents/task`, { headers: { cookie } });
  const checkData = await checkRes.json();
  const runningTask = checkData.tasks?.find(t => t.status === 'running');
  if (runningTask) {
    console.log(`Stopping previous running task ${runningTask.id}...`);
    await fetch(`${APP_URL}/api/agents/task/${runningTask.id}/stop`, {
      method: 'POST',
      headers: { cookie }
    });
    await new Promise(r => setTimeout(r, 2000));
  }

  // 1. Create task
  const createRes = await fetch(`${APP_URL}/api/agents/task`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ prompt: 'открой мне bilimclass' }),
  });

  const created = await createRes.json();
  console.log('Task created:', created);
  if (!created.taskId) {
    throw new Error('Не удалось создать задачу: ' + JSON.stringify(created));
  }

  const taskId = created.taskId;

  // 2. Stream SSE events from /api/agents/task/[id]
  console.log(`📡 Подключение к SSE-потоку задачи ${taskId}...`);
  const sseRes = await fetch(`${APP_URL}/api/agents/task/${taskId}`, {
    headers: { cookie }
  });

  if (!sseRes.ok) {
    throw new Error(`Ошибка подключения к SSE: ${sseRes.status} ${sseRes.statusText}`);
  }

  const reader = sseRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const timeout = setTimeout(() => {
    console.error('⏳ Превышен таймаут 180 секунд ожидания задачи');
    process.exit(1);
  }, 180_000);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;
        try {
          const event = JSON.parse(jsonStr);
          if (event.type === 'META') {
            console.log(`📋 [META] План:`, event.plan);
          } else if (event.type === 'STATUS') {
            console.log(`\n--- ИТОГ ВЫПОЛНЕНИЯ ---`);
            console.log('Status:', event.status);
            console.log('Result:', event.result);
            console.log('Error:', event.error);
            clearTimeout(timeout);
            if (event.error && event.error.includes('Cloudflare')) {
              console.error('❌ ОШИБКА: Всё ещё выпало в лимит Cloudflare!');
              process.exit(1);
            } else if (event.status === 'completed') {
              console.log('✅ УСПЕХ: Задача успешно выполнена агентом в Vercel Sandbox!');
            } else {
              console.log('ℹ Задача завершилась:', event.status);
            }
            return;
          } else if (event.type === 'LOG') {
            console.log(`  [LOG] ${event.message}`);
          } else {
            console.log(`  [${event.type}] ${event.message || JSON.stringify(event)}`);
          }
        } catch (e) {
          console.error('Failed to parse SSE event:', jsonStr, e);
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}

testUserExactPrompt();
