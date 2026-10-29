import { ObjectId } from 'mongodb';
import { getDb, COL } from '@/lib/mongo';
import { tools, type ToolCtx } from './tools';
import { executeWithFallback } from '@/lib/ai/providers';
import { getControlOwner, releaseControlToUser, setControlOwner, waitForControl } from './session';
import { buildCheckpoint, compactMessages, parseCheckpoint, repairTranscript, type AgentMessage } from './checkpoint';
import { getWorkspaceRuntime } from '@/lib/workspace/runtime';
import { isBilimClassContext, bilimClassInstructions } from '@/lib/agents/domain-skills/bilimclass';
import { appBaseUrl, decideContinuation, MAX_CONTINUATIONS, triggerContinuation } from './continuation';

const SYSTEM_PROMPT = `Ты — агент в рабочей области Mekty (сервис для учителей Казахстана).
Файлы пользователя сохраняются в отдельной рабочей области аккаунта. Не пытайся обращаться
к файловой системе или секретам приложения. Работай только с файлами, нужными для поручения.
Не читай переменные окружения, служебные credentials или данные другого пользователя.
Опасные команды требуют подтверждения в панели пользователя; если команда отклонена, не повторяй её обходными путями.
Доступные инструменты:
- runCommand — выполнить ограниченную по времени команду в изолированной Linux-песочнице пользователя;
- writeFile / readFile / listFiles — файлы в той же рабочей папке пользователя;
- browserNavigate — открыть публичную страницу в облачном браузере и получить её текст + список кликабельных элементов с координатами (x, y);
- browserClick — кликнуть в облачном браузере по координатам (x, y) из списка interactables;
- browserType — ввести текст в поле на странице в облачном браузере (с опциональными координатами x, y поля и нажатием Enter);
- browserDescribeScreen — показать текущий экран браузера vision-модели и получить текстовое описание того, что видно (заголовки, кнопки, графики, ошибки);
- createKsp — создать настоящий КСП (краткосрочный план урока) в аккаунте учителя: передай grade (класс), subject (предмет), topic (тема), при необходимости language ('ru' или 'kz') и objectives. Возвращает planId и ссылки на страницу, Word и PowerPoint;
- listPlans — список последних планов учителя (planId, тема), нужен, чтобы выбрать план для КТП;
- createKtp — составить календарно-тематический план (КТП) по существующему плану: planId, topics (список тем, к теме можно дописать « · 2 ч.» или « | 2026-09-01») и startDate (ГГГГ-ММ-ДД). Доступен на тарифе Pro;
- finishTask — завершить задачу с итоговым summary.
Если просят составить КСП или КТП — используй createKsp и createKtp, а не пиши план обычным текстом: так материал сохранится в аккаунте и его можно скачать. В итоге перечисли, что создано, и дай ссылки.
Правила: делай шаги по одному, после каждого инструмента анализируй результат.
Никогда не выдумывай результаты инструментов — они приходят в следующих сообщениях.
Для browserNavigate передавай любой обычный адрес http:// или https:// и пробуй открыть
его сразу. Проверку «не ведёт ли адрес во внутреннюю сеть» выполняет сам инструмент:
если адрес внутренний, вернётся ошибка — тогда сообщи об этом пользователю и предложи
другой адрес. Не отказывайся заранее из-за незнакомого вида домена: школьные порталы,
региональные системы и сайты учителей не похожи на популярные сервисы, но для этого
инструмента это обычная работа.
Если страница требует входа: пароль за тебя не вводи — это делает учитель вручную во
вкладке «Браузер». Сообщи, что нужен вход, и дождись, пока учитель войдёт.
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
  { type: 'function' as const, function: { name: 'browserDescribeScreen', description: 'Получить текстовое описание того, что сейчас видно на экране браузера (зрение): заголовки, кнопки, графики, ошибки. Полезно, когда текст страницы не даёт ответа', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function' as const, function: { name: 'createKsp', description: 'Создать КСП (краткосрочный план урока) и сохранить в аккаунте учителя; вернёт planId и ссылки на страницу, Word и PowerPoint', parameters: { type: 'object', properties: { grade: { type: 'number', description: 'Класс, 1–11' }, subject: { type: 'string', description: 'Предмет, например «Математика»' }, topic: { type: 'string', description: 'Тема урока' }, language: { type: 'string', enum: ['ru', 'kz'] }, objectives: { type: 'array', items: { type: 'string' }, description: 'Цели обучения (необязательно)' } }, required: ['grade', 'subject', 'topic'] } } },
  { type: 'function' as const, function: { name: 'listPlans', description: 'Список последних планов учителя: planId, название, тема', parameters: { type: 'object', properties: { limit: { type: 'number' } }, required: [] } } },
  { type: 'function' as const, function: { name: 'createKtp', description: 'Составить КТП по существующему плану (planId из listPlans или createKsp). Тариф Pro', parameters: { type: 'object', properties: { planId: { type: 'string' }, topics: { type: 'array', items: { type: 'string' } }, startDate: { type: 'string', description: 'ГГГГ-ММ-ДД' } }, required: ['planId'] } } },
  { type: 'function' as const, function: { name: 'finishTask', description: 'Завершить задачу с итогом', parameters: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] } } },
];

// Общий лимит шагов на задачу (все провайдеры и перезапуски вместе). 12 шагов
// не хватало даже на «открыть страницу → найти → кликнуть → проверить».
const MAX_LOOPS = 120;
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

  // runAgentTask вызывается не только через startAgentTask: из очереди и при
  // оживлении зависшей задачи он стартует напрямую. В этих путях в Mongo мог
  // остаться owner=user от предыдущей паузы, и новый агент немедленно
  // засыпал, ни разу не открыв браузер. Новый запуск всегда начинается у ИИ;
  // позже учитель может безопасно забрать управление обычным control API.
  await setControlOwner(userId, 'ai');

  const finish = async (status: 'completed' | 'failed' | 'stopped', patch: Record<string, unknown> = {}) => {
    await agentTasks.updateOne(
      { _id: new ObjectId(taskId) },
      { $set: { status, updated_at: new Date(), ...patch }, $unset: { heartbeat_at: 1, checkpoint: 1 } },
    );
    // Задача окончена — общая рабочая область возвращается учителю. Иначе
    // панель навсегда оставляла «AI РАБОТАЕТ» и кнопку «Забрать управление
    // себе», хотя управлять было уже некому.
    await releaseControlToUser(userId, taskId).catch(() => {});
    // Освободился слот — пробуем запустить следующее поручение из очереди.
    // Если фоновый запуск потеряется, его подхватит «будильник» GET
    // /api/agents/task, который опрашивает интерфейс.
    try {
      const { dispatchQueuedTask } = await import('./orchestrator');
      await dispatchQueuedTask();
    } catch { /* очередь не должна ломать завершение задачи */ }
  };

  // Сердцебиение: «пока статус running, раннер жив». Если серверлесс-функция
  // гибнет по лимиту 300 с (в т.ч. пока агент ждёт учителя на паузе),
  // heartbeat_at перестаёт обновляться — orchestrator считает задачу
  // зомби и освобождает слот. Без него задача-зомби навсегда держала бы
  // AGENT_TASK_ALREADY_RUNNING, и агент становился недоступен для учителя.
  const beat = async () => {
    try {
      await agentTasks.updateOne(
        { _id: new ObjectId(taskId), status: 'running' },
        { $set: { heartbeat_at: new Date() } },
      );
    } catch {
      // сбой записи не должен валить выполнение задачи
    }
  };

  // Watchdog: «Остановить» меняет статус в БД — прерываем долгий вызов
  // модели/инструмента через AbortController, а не ждём конца следующей
  // итерации (задержка могла достигать десятков секунд).
  const abortController = new AbortController();
  const watchdog = setInterval(async () => {
    try {
      const t = await agentTasks.findOne({ _id: new ObjectId(taskId) }, { projection: { status: 1 } });
      if (t && t.status !== 'running') abortController.abort();
    } catch {
      // кратковременный сбой БД — пропускаем тик
    }
  }, 1200);

  try {
    await beat(); // раннер поднялся — фиксируем жизнь до медленной проверки песочницы
    await log({ type: 'START', message: `Задача запущена (${taskId})` }).catch(() => {});
    const workspace = await getWorkspaceRuntime(userId);
    const sandboxStatus = await workspace.getSandboxStatus();
    const shellAvailable = sandboxStatus.available;
    const activeTools = shellAvailable
      ? tools
      : Object.fromEntries(Object.entries(tools).filter(([name]) => name !== 'runCommand'));
    const activeToolSchemas = shellAvailable
      ? TOOL_SCHEMAS
      : TOOL_SCHEMAS.filter((tool) => tool.function.name !== 'runCommand');
    const baseSystemPrompt = shellAvailable
      ? SYSTEM_PROMPT
      : `${SYSTEM_PROMPT}\nВ этой рабочей области доступны браузер и файлы, но Linux-среда выполнения сейчас недоступна. Не вызывай команды и не утверждай, что скрипты запускались. Если задаче необходимо выполнить программу или системную команду, заверши её как заблокированную и объясни, что среда выполнения не настроена.`;

    // Долговременная «память»: темы недавних задач помогают следующему
    // поручению не начинать с нуля. Только заголовки (title) — без результатов,
    // чтобы исключить утечку персональных данных (имена учеников, оценки, URL).
    let memoryBlock = '';
    try {
      const recent = await agentTasks
        .find(
          {
            user_id: new ObjectId(userId),
            status: { $in: ['completed', 'stopped'] },
          },
          { projection: { title: 1, updated_at: 1 } }, // только тема, НЕ result
        )
        .sort({ updated_at: -1 })
        .limit(3)
        .toArray();
      const parts = recent
        .map((t) => String(t.title ?? '').trim().slice(0, 80))
        .filter(Boolean);
      if (parts.length) {
        memoryBlock = `\nПоследние поручения (только темы, без результатов):\n${parts.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;
      }
    } catch { /* память некритична */ }

    const systemPrompt = (isBilimClassContext(prompt, '')
      ? `${baseSystemPrompt}\n\n${bilimClassInstructions()}`
      : baseSystemPrompt) + memoryBlock;
    const deadline = Date.now() + TIME_BUDGET_MS;

    // Контрольная точка: после падения функции или паузы агент продолжает с
    // сохранённого транскрипта, а не начинает задачу с нуля.
    const stored = await agentTasks.findOne({ _id: new ObjectId(taskId) }, { projection: { checkpoint: 1 } });
    const resumed = parseCheckpoint(stored?.checkpoint);
    let transcript: AgentMessage[] | null = resumed
      ? [{ role: 'system', content: systemPrompt }, ...resumed.messages.slice(1)]
      : null;
    let stepsUsed = resumed?.step ?? 0;
    let pausedForTimeout = false;
    let incompleteReason: 'steps' | 'time' | undefined;
    if (resumed) {
      await log({ type: 'RESUMED', message: `Продолжаю с шага ${resumed.step + 1}: прежний ход работы сохранён.` }).catch(() => {});
    }
    const saveCheckpoint = async (completedSteps = stepsUsed) => {
      if (!transcript) return;
      try {
        await agentTasks.updateOne(
          { _id: new ObjectId(taskId) },
          { $set: { checkpoint: buildCheckpoint(completedSteps, transcript) } },
        );
      } catch {
        // точка — страховка; сбой записи не должен валить задачу
      }
    };
    // Сообщение о жёстком ограничении браузера (дневной лимит, 429):
    // только такие ошибки прерывают весь цикл. Мягкие ошибки (таймаут
    // загрузки, недоступная страница) возвращаются модели — она сама
    // решает, повторить или завершить задачу.
    let hardBrowserFailure: string | undefined;

    // Мульти-провайдерный фоллбэк: Groq → Cerebras → Gemini → OpenRouter.
    // Провайдер используется для всего цикла; при его сбое (лимит 429 и т.п.)
    // loop перезапускается на следующем провайдере.
    const summaryFinal = await executeWithFallback('tasks', async (client, model, config, signal) => {
      // ── План: короткий чеклист из 3–5 шагов для чата (как у Devin) ──
      // План строится один раз; при продолжении с контрольной точки он уже есть.
      if (!transcript) try {
        const planResp = await client.chat.completions.create(
          {
            model,
            temperature: 0.2,
            max_completion_tokens: 512,
            messages: [
              { role: 'system', content: 'Ты только составляешь план для другого агента, у которого есть инструменты для файлов и браузера. Не исполняй поручение, не отказывайся и не говори, что у тебя нет доступа. Составь 3–5 коротких шагов по-русски. Выведи только JSON без Markdown строго вида {"steps":["шаг 1","шаг 2","шаг 3"]}.' },
              { role: 'user', content: `Задание другого агента: ${prompt}` },
            ],
          },
          { signal },
        );
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

      // Транскрипт живёт снаружи колбэка: при сбое провайдера следующий
      // продолжает с того же места, а не с пустого листа (раньше повторялись
      // уже сделанные действия в браузере). Висячие вызовы инструментов
      // после обрыва вычищаются.
      let messages: AgentMessage[] = transcript
        ? repairTranscript(transcript)
        : [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ];
      transcript = messages;
      let done = false;
      let summary = '';
      let textOnlyStreak = 0;

      while (stepsUsed < MAX_LOOPS && !done) {
        const step = ++stepsUsed;
        if (Date.now() > deadline) {
          await log({ type: 'WARNING', message: 'Время этой сессии вышло: сохраняю прогресс.' });
          stepsUsed--; // шаг не выполнялся
          incompleteReason = 'time';
          break;
        }

        // Пользователь мог нажать «Остановить» — статус в БД меняется на stopped.
        await beat(); // каждый виток цикла рапортует, что раннер жив
        const current = await agentTasks.findOne({ _id: new ObjectId(taskId) }, { projection: { status: 1 } });
        if (current && current.status !== 'running') {
          await log({ type: 'END', message: 'Остановлено пользователем' });
          await finish('stopped', { result: 'Остановлено пользователем' });
          return 'Остановлено пользователем';
        }

        // Страховка: состояние на начало шага. Если функция погибнет, новый
        // раннер продолжит именно отсюда.
        await saveCheckpoint(step - 1);

        // TAKE CONTROL: пока управление у пользователя — агент стоит на паузе
        // (не выполняет ни одного действия) и ждёт «GIVE CONTROL TO AI».
        if (await getControlOwner(userId) === 'user') {
          await log({ type: 'PAUSED', message: 'Пользователь забрал управление. Агент ожидает («GIVE CONTROL TO AI»).' });
          const outcome = await waitForControl(userId, async () => {
            const t = await agentTasks.findOne({ _id: new ObjectId(taskId) }, { projection: { status: 1 } });
            return !!t && t.status !== 'running';
          }, beat, deadline);
          if (outcome === 'stopped') {
            await log({ type: 'END', message: 'Остановлено пользователем' });
            await finish('stopped', { result: 'Остановлено пользователем' });
            return 'Остановлено пользователем';
          }
          if (outcome === 'timeout') {
            // Жизни функции почти не осталось. Не делаем вид, что ждём вечно:
            // сохраняем точку и помечаем пульс «давно умершим», чтобы кнопка
            // «Передать управление ИИ» сразу перезапустила задачу отсюда.
            stepsUsed--;
            await saveCheckpoint(stepsUsed);
            await agentTasks.updateOne(
              { _id: new ObjectId(taskId), status: 'running' },
              { $set: { heartbeat_at: new Date(0) } },
            ).catch(() => {});
            await log({ type: 'WARNING', message: 'Сессия агента скоро закончится, пока вы работаете вручную. Прогресс сохранён: нажмите «Передать управление ИИ» — задача продолжится с этого места.' });
            pausedForTimeout = true;
            return 'paused';
          }
          await log({ type: 'RESUMED', message: 'Управление возвращено агенту. Продолжаю.' });
          // После паузы агент должен увидеть актуальный URL — браузер живёт в песочнице.
          try {
            const { getAgentBrowserSession } = await import('@/lib/agents/browser-session');
            const { readInteractables } = await import('@/lib/agents/computer/screen');
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
          } catch { /* браузер мог ещё не открыться — некритично */ }
        }

        await log({ type: 'THINK', message: `Шаг ${step}: обдумываю следующий ход…` });

        messages = compactMessages(messages);
        transcript = messages;
        const response = await client.chat.completions.create(
          {
            model,
            max_completion_tokens: 1024,
            messages,
            tools: activeToolSchemas,
            tool_choice: 'auto',
            temperature: 0.2,
          },
          { signal },
        );
        await beat(); // долгий вызов модели позади — подтверждаем жизнь

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
          const tool = (activeTools as unknown as Record<string, (a: Record<string, unknown>, c: ToolCtx) => Promise<unknown>>)[name];
          if (!tool) {
            resultStr = JSON.stringify({ success: false, error: `Неизвестный инструмент: ${name}` });
          } else {
            try {
              const res = await tool(args, { taskId, userId, signal: abortController.signal, beat, deadline });
              // Браузерные инструменты уже укладываются в ~5000 символов
              // (boundedResult). Обрезка JSON посреди строки ломала разбор
              // authBarrier ниже, поэтому режем только прочие результаты.
              const rawResult = JSON.stringify(res);
              resultStr = name.startsWith('browser') ? rawResult.slice(0, 6000) : rawResult.slice(0, 4000);
            } catch (e) {
              resultStr = JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'tool failed' });
            }
          }
          await beat(); // каждый сделанный шаг инструмента — подтверждение жизни
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
                // Жёсткая остановка — только когда браузер не поднять в принципе
                // (нужен администратор). Прежде здесь ловился дневной лимит
                // Cloudflare Browser Run, которого в проекте больше нет.
                const isUnavailableForGood = /не установился|не удалось запустить браузер/i.test(errMsg);
                if (isUnavailableForGood) {
                  hardBrowserFailure = errMsg;
                  await log({ type: 'ERROR', message: `Браузер рабочей области недоступен: ${errMsg}` });
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
        // Лимит шагов общий для всех провайдеров, поэтому смена провайдера
        // его не продлит: прежде такой «перебор» перезапускал задачу с нуля
        // и повторял действия. Завершаем честно, прогресс остаётся в точке.
        incompleteReason = incompleteReason ?? 'steps';
        await saveCheckpoint(stepsUsed);
      }
      return summary;
    }, { signal: abortController.signal, budgetMs: TIME_BUDGET_MS });

    // Агент ждал учителя, пока функция не начала умирать: статус остаётся
    // running с «давним» пульсом, кнопка «Передать управление ИИ» перезапустит
    // задачу с контрольной точки.
    if (pausedForTimeout) return;

    // Время сессии вышло, а задача не закончена: продолжаем в новом запросе с
    // контрольной точки, а не требуем от учителя запускать задачу заново.
    if (incompleteReason === 'time') {
      const row = await agentTasks.findOne({ _id: new ObjectId(taskId) }, { projection: { continuations: 1, status: 1 } });
      const continuations = Number(row?.continuations ?? 0);
      if (row?.status === 'running' && decideContinuation({ reason: incompleteReason, continuations, appUrl: appBaseUrl() }) === 'continue') {
        await saveCheckpoint(stepsUsed);
        await agentTasks.updateOne({ _id: new ObjectId(taskId) }, { $inc: { continuations: 1 }, $set: { heartbeat_at: new Date() } });
        await log({ type: 'RESUMED', message: `Задача большая: продолжаю в новой сессии (${continuations + 1} из ${MAX_CONTINUATIONS}), прогресс сохранён.` }).catch(() => {});
        if (await triggerContinuation(taskId)) return;
        await log({ type: 'WARNING', message: 'Не удалось автоматически продолжить задачу.' }).catch(() => {});
      }
    }

    if (incompleteReason) {
      const error = incompleteReason === 'steps'
        ? `Достигнут лимит шагов (${MAX_LOOPS}), а задача не завершена. Уточните поручение или разбейте его на части.`
        : 'Время сессии агента вышло до завершения задачи. Запустите её ещё раз — прогресс сохранён.';
      await log({ type: 'ERROR', message: error });
      await finish('failed', { error });
      return;
    }

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
    // AbortError — пользователь остановил задачу (watchdog) или сервер оборвал
    // соединение: это не сбой, завершаем аккуратно статусом stopped.
    if (abortController.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      const afterStop = await agentTasks.findOne({ _id: new ObjectId(taskId) }, { projection: { status: 1 } });
      if (afterStop?.status !== 'stopped') {
        await finish('stopped', { result: 'Остановлено пользователем' });
      }
      return;
    }
    const message = error instanceof Error ? error.message : 'Ошибка агента';
    await log({ type: 'ERROR', message: `Агент упал: ${message}` });
    await finish('failed', { error: message });
  } finally {
    clearInterval(watchdog);
  }
}

function humanToolCall(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'runCommand': return `Выполняю команду в песочнице: ${String(args.command ?? '').slice(0, 100)}`;
    case 'writeFile': return `Создаю файл ${String(args.filename ?? '')}`;
    case 'readFile': return `Читаю файл ${String(args.filename ?? '')}`;
    case 'listFiles': return 'Смотрю файлы рабочей области';
    case 'browserNavigate': return `Открываю страницу ${String(args.url ?? '')}`.slice(0, 300);
    case 'browserClick': return `Нажимаю (${String(args.x ?? '?')}, ${String(args.y ?? '?')})${args.intent ? ` — ${String(args.intent)}` : ''}`.slice(0, 300);
    case 'browserType': return `Ввожу текст «${String(args.text ?? '').slice(0, 80)}»`.slice(0, 300);
    case 'browserDescribeScreen': return 'Смотрю на экран браузера';
    case 'createKsp': return `Создаю КСП: ${String(args.subject ?? '')}, ${String(args.grade ?? '?')} класс — ${String(args.topic ?? '')}`.slice(0, 300);
    case 'createKtp': return 'Составляю календарно-тематический план (КТП)';
    case 'listPlans': return 'Смотрю ваши планы';
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
    if (name === 'createKsp' || name === 'createKtp') return parsed.success === false ? (parsed.error ?? 'Не удалось создать материал') : (parsed.message ?? 'Готово');
    if (name === 'listPlans') return parsed.success === false ? (parsed.error ?? '') : 'Планы получены';
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
