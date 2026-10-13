import { ObjectId } from 'mongodb';
import { getDb, COL } from '@/lib/mongo';
import { tools } from './tools';
import OpenAI from 'openai';
import { executeWithFallback } from '@/lib/ai/providers';
import { getControlOwner, waitForControl } from './session';
import { getWorkspaceRuntime } from '@/lib/workspace/runtime';
import { isBilimClassContext, bilimClassInstructions } from '@/lib/agents/domain-skills/bilimclass';

const SYSTEM_PROMPT = `Ты — агент в рабочей области Mekty (сервис для учителей Казахстана).
Файлы пользователя сохраняются в отдельной рабочей области аккаунта. Не пытайся обращаться
к файловой системе или секретам приложения. Работай только с файлами, нужными для поручения.
Не читай переменные окружения, служебные credentials или данные другого пользователя.
Опасные команды требуют подтверждения в панели пользователя; если команда отклонена, не повторяй её обходными путями.
Доступные инструменты:
- runCommand — выполнить ограниченную по времени команду в отдельной Linux-песочнице пользователя;
- writeFile / readFile / listFiles — файлы в той же рабочей папке пользователя;
- browserNavigate — открыть публичную страницу в облачном браузере и получить её текст + список кликабельных элементов с координатами (x, y);
- browserClick — кликнуть в облачном браузере по координатам (x, y) из списка interactables;
- browserType — ввести текст в поле на странице в облачном браузере (с опциональными координатами x, y поля и нажатием Enter);
- finishTask — завершить задачу с итоговым summary.
Правила: делай шаги по одному, после каждого инструмента анализируй результат.
Никогда не выдумывай результаты инструментов — они приходят в следующих сообщениях.
Для browserNavigate разрешены только обычные публичные адреса http:// или https://.
Не открывай view-source:, data:, javascript:, about: и другие технические схемы. Если
инструмент уже вернул заголовок или текст, используй этот результат в итоговом ответе и
вызови finishTask; не пытайся читать исходный код страницы.
Задача считается выполненной, когда результат реально создан/получен. Тогда вызови finishTask
с кратким итогом на русском языке (что сделано, какие файлы созданы).`;

const TOOL_SCHEMAS = [
  { type: 'function' as const, function: { name: 'runCommand', description: 'Выполнить команду в изолированной Linux-среде пользователя. Максимум 90 секунд на команду.', parameters: { type: 'object', properties: { command: { type: 'string' }, timeoutMs: { type: 'number' } }, required: ['command'] } } },
  { type: 'function' as const, function: { name: 'writeFile', description: 'Создать/перезаписать файл в песочнице', parameters: { type: 'object', properties: { filename: { type: 'string' }, content: { type: 'string' } }, required: ['filename', 'content'] } } },
  { type: 'function' as const, function: { name: 'readFile', description: 'Прочитать файл из песочницы', parameters: { type: 'object', properties: { filename: { type: 'string' } }, required: ['filename'] } } },
  { type: 'function' as const, function: { name: 'listFiles', description: 'Список файлов песочницы', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function' as const, function: { name: 'browserNavigate', description: 'Открыть URL в браузере, вернуть заголовок, видимый текст и список кликабельных элементов interactables с координатами (x, y)', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } } },
  { type: 'function' as const, function: { name: 'browserClick', description: 'Кликнуть в браузере по координатам (x, y) из списка interactables текущей страницы и вернуть обновлённый экран', parameters: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, intent: { type: 'string', description: 'Краткое пояснение, на какую кнопку нажимаем' } }, required: ['x', 'y'] } } },
  { type: 'function' as const, function: { name: 'browserType', description: 'Ввести текст в поле на странице браузера (опционально кликнув по координатам x, y из interactables) и вернуть обновлённый экран', parameters: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, text: { type: 'string' }, pressEnter: { type: 'boolean' } }, required: ['text'] } } },
  { type: 'function' as const, function: { name: 'finishTask', description: 'Завершить задачу с итогом', parameters: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] } } },
];

const MAX_LOOPS = 12;
// Leave headroom under Vercel Hobby's five-minute function ceiling.
const TIME_BUDGET_MS = 4 * 60_000 + 50_000;

export interface ExecutionEvent {
  type: string;
  message: string;
  data?: Record<string, unknown>;
}

export async function runAgentTask(
  taskId: string,
  prompt: string,
  userId: string,
  log: (event: ExecutionEvent) => Promise<void>,
): Promise<void> {
  const db = await getDb();
  const agentTasks = db.collection(COL.agentTasks);

  const finish = async (status: 'completed' | 'failed' | 'stopped', patch: Record<string, unknown> = {}) => {
    await agentTasks.updateOne(
      { _id: new ObjectId(taskId) },
      { $set: { status, updatedAt: new Date(), ...patch } },
    );
  };

  try {
    const workspace = await getWorkspaceRuntime(userId);
    const shellAvailable = (await workspace.getSandboxStatus()).available;
    const activeTools = shellAvailable
      ? tools
      : Object.fromEntries(Object.entries(tools).filter(([name]) => name !== 'runCommand'));
    const activeToolSchemas = shellAvailable
      ? TOOL_SCHEMAS
      : TOOL_SCHEMAS.filter((tool) => tool.function.name !== 'runCommand');
    const baseSystemPrompt = shellAvailable
      ? SYSTEM_PROMPT
      : `${SYSTEM_PROMPT}\nВ этой рабочей области доступны браузер и файлы, но Linux-среда выполнения сейчас недоступна. Не вызывай команды и не утверждай, что скрипты запускались. Если задаче необходимо выполнить программу или системную команду, заверши её как заблокированную и объясни, что среда выполнения не настроена.`;
    const systemPrompt = isBilimClassContext(prompt, '')
      ? `${baseSystemPrompt}\n\n${bilimClassInstructions()}`
      : baseSystemPrompt;
    const deadline = Date.now() + TIME_BUDGET_MS;
    // Сообщение о жёстком ограничении браузера (дневной лимит, 429):
    // только такие ошибки прерывают весь цикл. Мягкие ошибки (таймаут
    // загрузки, недоступная страница) возвращаются модели — она сама
    // решает, повторить или завершить задачу.
    let hardBrowserFailure: string | undefined;

    // Мульти-провайдерный фоллбэк: Groq → Cerebras → Gemini → OpenRouter.
    // Провайдер используется для всего цикла; при его сбое (лимит 429 и т.п.)
    // loop перезапускается на следующем провайдере.
    const summaryFinal = await executeWithFallback('tasks', async (client, model) => {
      // ── План: короткий чеклист из 3–5 шагов для чата (как у Devin) ──
      try {
        const planResp = await client.chat.completions.create({
          model,
          temperature: 0.2,
          max_completion_tokens: 512,
          messages: [
            { role: 'system', content: 'Ты только составляешь план для другого агента, у которого есть инструменты для файлов и браузера. Не исполняй поручение, не отказывайся и не говори, что у тебя нет доступа. Составь 3–5 коротких шагов по-русски. Выведи только JSON без Markdown строго вида {"steps":["шаг 1","шаг 2","шаг 3"]}.' },
            { role: 'user', content: `Задание другого агента: ${prompt}` },
          ],
        });
        const raw = planResp.choices[0]?.message?.content ?? '{}';
        const parsed = JSON.parse(raw) as { steps?: unknown };
        const plan = Array.isArray(parsed.steps)
          ? parsed.steps.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, 5)
          : [];
        if (plan.length) {
          await agentTasks.updateOne({ _id: new ObjectId(taskId) }, { $set: { plan } });
          await log({ type: 'PLAN', message: 'План готов', data: { plan } });
        }
      } catch {
        // план не обязателен — без него просто выполняем задачу
      }

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ];
      let done = false;
      let summary = '';
      let textOnlyStreak = 0;

      for (let step = 1; step <= MAX_LOOPS && !done; step++) {
        if (Date.now() > deadline) {
          await log({ type: 'WARNING', message: 'Истёк пятиминутный лимит задачи. Остановка.' });
          break;
        }

        // Пользователь мог нажать «Остановить» — статус в БД меняется на stopped.
        const current = await agentTasks.findOne({ _id: new ObjectId(taskId) }, { projection: { status: 1 } });
        if (current && current.status !== 'running') {
          await log({ type: 'END', message: 'Остановлено пользователем' });
          await finish('stopped', { result: 'Остановлено пользователем' });
          return 'Остановлено пользователем';
        }

        // TAKE CONTROL: пока управление у пользователя — агент стоит на паузе
        // (не выполняет ни одного действия) и ждёт «GIVE CONTROL TO AI».
        if (await getControlOwner(userId) === 'user') {
          await log({ type: 'PAUSED', message: 'Пользователь забрал управление. Агент ожидает («GIVE CONTROL TO AI»).' });
          const outcome = await waitForControl(userId, async () => {
            const t = await agentTasks.findOne({ _id: new ObjectId(taskId) }, { projection: { status: 1 } });
            return !!t && t.status !== 'running';
          });
          if (outcome === 'stopped') {
            await log({ type: 'END', message: 'Остановлено пользователем' });
            await finish('stopped', { result: 'Остановлено пользователем' });
            return 'Остановлено пользователем';
          }
          await log({ type: 'RESUMED', message: 'Управление возвращено агенту. Продолжаю.' });
          // После паузы агент должен увидеть актуальный URL и содержимое страницы,
          // на которой учитель ввёл логин/пароль в рабочей области ОС.
          try {
            const { getVercelSandbox } = await import('@/lib/workspace/runtime');
            const { startSandboxBrowser, getSandboxBrowserState } = await import('@/lib/agents/browser-sandbox');
            const { persistSandboxBrowserState, readStoredBrowserState, getAgentBrowserSession } = await import('@/lib/agents/browser-session');
            const { readInteractables } = await import('@/lib/agents/computer/screen');
            const sandbox = await getVercelSandbox(userId).catch(() => null);
            if (sandbox) {
              const stored = await readStoredBrowserState(userId).catch(() => null);
              const page = await startSandboxBrowser(sandbox, {
                storageState: stored?.storageState,
                currentUrl: stored?.currentUrl,
              });
              const currentUrl = page.url();
              const title = await page.title().catch(() => '');
              const content = (await page.evaluate(() => {
                const doc = window.document.cloneNode(true) as Document;
                doc.querySelectorAll('script, style, nav, footer, iframe').forEach((el) => el.remove());
                return (doc.body?.innerText ?? '').slice(0, 1500);
              }).catch(() => '')) as string;
              const interactables = await readInteractables(page as never);
              const st = await getSandboxBrowserState(sandbox);
              await persistSandboxBrowserState(userId, st.storageState, st.currentUrl).catch(() => {});
              if (currentUrl && /^https?:\/\//i.test(currentUrl)) {
                messages.push({
                  role: 'user',
                  content: `Управление возвращено агенту после действий учителя в рабочей области ОС. Текущая страница: ${currentUrl}${title ? ` («${title}»)` : ''}.\nВидимый текст:\n${content}\nКликабельные элементы (interactables):\n${interactables}\nПродолжай выполнять исходную задачу с этой точки (используй browserClick или browserNavigate).`,
                });
              }
            } else {
              const browserSess = await getAgentBrowserSession(userId).catch(() => null);
              if (browserSess) {
                const currentUrl = browserSess.page.url();
                const interactables = await readInteractables(browserSess.page as never);
                if (currentUrl && /^https?:\/\//i.test(currentUrl)) {
                  messages.push({
                    role: 'user',
                    content: `Управление возвращено агенту. Пока вы работали вручную, текущая страница: ${currentUrl}.\nКликабельные элементы (interactables):\n${interactables}\nПродолжай выполнять исходную задачу с этой точки (используй browserClick или browserNavigate).`,
                  });
                }
              }
            }
          } catch { /* браузер мог ещё не открыться — некритично */ }
        }

        await log({ type: 'THINK', message: `Шаг ${step}: обдумываю следующий ход…` });

        const response = await client.chat.completions.create({
          model,
          max_completion_tokens: 1024,
          messages,
          tools: activeToolSchemas,
          tool_choice: 'auto',
          temperature: 0.2,
        });

        const message = response.choices[0]?.message;
        if (!message) throw new Error('Модель не вернула ответ');
        messages.push(message);

      if (message.content) {
        await log({ type: 'REASONING', message: String(message.content).slice(0, 600) });
      }

      const toolCalls = message.tool_calls ?? [];
      if (toolCalls.length === 0) {
        const text = String(message.content ?? '').slice(0, 2000);
        textOnlyStreak = (textOnlyStreak ?? 0) + 1;
        if (textOnlyStreak >= 3) {
          // Модель 3 раза подряд не вызвала инструмент — завершаем автоматически
          summary = text.slice(0, 500) || 'Задача завершена (авто)';
          await log({ type: 'END', message: `Агент завершил ответом: ${summary}` });
          done = true;
          continue;
        }
        await log({ type: 'WARNING', message: 'Модель не вызвала finishTask — прошу подтвердить результат инструментом.' });
        messages.push({
          role: 'user',
          content: 'Не объявляй задачу завершённой обычным текстом. Проверь результат и вызови finishTask с итогом; если выполнить нельзя — также вызови finishTask и объясни причину.',
        });
        if (text) await log({ type: 'REASONING', message: text });
        continue;
      }
      textOnlyStreak = 0;


      for (const call of toolCalls) {
        const fn = (call as { function?: { name?: string; arguments?: string } }).function;
        const name = fn?.name ?? 'unknown';
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(fn?.arguments ?? '{}'); } catch { /* пустые аргументы */ }

        await log({
          type: 'TOOL_CALL',
          message: humanToolCall(name, args),
          data: { tool: name, args: shrinkArgs(name, args) },
        });

        let resultStr: string;
        if (name === 'finishTask') {
          summary = String(args.summary ?? '').slice(0, 2000);
          resultStr = JSON.stringify({ success: true });
          await log({ type: 'END', message: summary || 'Задача завершена' });
          done = true;
        } else {
          const tool = (activeTools as unknown as Record<string, (a: Record<string, unknown>, c: { taskId: string; userId: string }) => Promise<unknown>>)[name];
          if (!tool) {
            resultStr = JSON.stringify({ success: false, error: `Неизвестный инструмент: ${name}` });
          } else {
            try {
              const res = await tool(args, { taskId, userId });
              resultStr = JSON.stringify(res).slice(0, 4000);
            } catch (e) {
              resultStr = JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'tool failed' });
            }
          }
          await log({ type: 'TOOL_RESULT', message: humanToolResult(name, resultStr), data: { tool: name, result: resultStr } });
          if (name === 'browserNavigate' || name === 'browserClick' || name === 'browserType') {
            try {
              const browserResult = JSON.parse(resultStr) as {
                success?: boolean;
                error?: string;
                url?: string;
                authBarrier?: { requiresUserAction?: boolean; kind?: string | null; reason?: string; domain?: string };
              };
              if (browserResult.success === false) {
                const errMsg = browserResult.error ?? 'Браузер не смог выполнить действие';
                const isHardLimit = /daily.{0,30}limit|time limit exceeded|10 minutes per day|достигнут дневной лимит/i.test(errMsg);
                if (isHardLimit) {
                  hardBrowserFailure = errMsg;
                  await log({ type: 'ERROR', message: `Браузер недоступен (дневной лимит): ${errMsg}` });
                  done = true;
                } else {
                  await log({ type: 'WARNING', message: `Браузер вернул ошибку: ${errMsg}. Агент продолжает.` });
                }
              } else if (
                browserResult.authBarrier?.requiresUserAction &&
                /(войди|авторизуй|отметь|заполни|выстави|расписан|журнал|оценк|домашн|дз\b|отчет|отчёт|логин|парол|дэшборд|дешборд|провед|ктп|урок)/i.test(prompt)
              ) {
                const { setControlOwner } = await import('@/lib/agents/session');
                await setControlOwner(userId, 'user');
                await log({
                  type: 'PAUSED',
                  message: browserResult.authBarrier.reason || 'Требуется вход: введите логин и пароль прямо на экране в рабочей области ОС («Браузер»), затем нажмите «Продолжить с ИИ».',
                  data: { url: browserResult.url, authBarrier: browserResult.authBarrier },
                });
              }
            } catch {
              // Не-JSON результат уходит модели без изменений.
            }
          }
        }

        messages.push({ role: 'tool', tool_call_id: (call as { id?: string }).id ?? '', content: resultStr });
        if (hardBrowserFailure) break;
      }
      }

      if (!done) {
        // Все шаги израсходованы этим провайдером — сигнализируем наверх,
        // чтобы фоллбэк попробовал следующего (если шаги кончились и там, задачи не будет).
        await log({ type: 'WARNING', message: 'Лимит шагов у провайдера. Пробую другого…' });
        throw new Error('max loops reached');
      }
      return summary;
    });

    if (hardBrowserFailure) {
      await finish('failed', { error: hardBrowserFailure });
      return;
    }

    // «Остановлено пользователем» не перезатираем финалом цикла.
    const afterStop = await agentTasks.findOne({ _id: new ObjectId(taskId) }, { projection: { status: 1 } });
    if (afterStop?.status !== 'stopped') {
      await finish('completed', { result: summaryFinal || null });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка агента';
    await log({ type: 'ERROR', message: `Агент упал: ${message}` });
    await finish('failed', { error: message });
  }
}

function humanToolCall(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'runCommand': return `Выполняю команду в Linux-песочнице: ${String(args.command ?? '').slice(0, 100)}`;
    case 'writeFile': return `Создаю файл ${String(args.filename ?? '')}`;
    case 'readFile': return `Читаю файл ${String(args.filename ?? '')}`;
    case 'listFiles': return 'Смотрю файлы рабочей области';
    case 'browserNavigate': return `Открываю страницу ${String(args.url ?? '')}`.slice(0, 300);
    case 'browserClick': return `Нажимаю (${String(args.x ?? '?')}, ${String(args.y ?? '?')})${args.intent ? ` — ${String(args.intent)}` : ''}`.slice(0, 300);
    case 'browserType': return `Ввожу текст «${String(args.text ?? '').slice(0, 80)}»`.slice(0, 300);
    case 'finishTask': return 'Завершаю задачу';
    default: return `Вызов ${name}`;
  }
}

function humanToolResult(name: string, resultStr: string): string {
  try {
    const parsed = JSON.parse(resultStr) as { success?: boolean; output?: string; error?: string; title?: string; content?: string; files?: string[]; message?: string; exitCode?: number; stdout?: string; stderr?: string; clicked?: string; typed?: string; url?: string };
    if (name === 'browserNavigate') return parsed.title ? `Страница: ${parsed.title}` : parsed.error ?? '';
    if (name === 'browserClick') return parsed.clicked ? `Нажато: ${parsed.clicked} → ${parsed.title || parsed.url || ''}` : parsed.error ?? '';
    if (name === 'browserType') return parsed.typed ? `Введено: «${parsed.typed}»` : parsed.error ?? '';
    if (name === 'runCommand') return parsed.error ?? `Код завершения ${String(parsed.exitCode ?? '?')}: ${String(parsed.stdout ?? parsed.stderr ?? '').slice(0, 250)}`;
    if (name === 'listFiles') return parsed.files?.length ? parsed.files.join(', ') : '(песочница пуста)';
    return parsed.message ?? parsed.error ?? parsed.output?.slice(0, 200) ?? 'готово';
  } catch {
    return resultStr.slice(0, 200);
  }
}

function shrinkArgs(name: string, args: Record<string, unknown>): Record<string, unknown> {
  if (name === 'writeFile' && typeof args.content === 'string') {
    return { filename: args.filename, contentLength: args.content.length };
  }
  return args;
}
