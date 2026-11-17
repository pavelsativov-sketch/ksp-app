# Аудит проекта KSP App

**Дата:** 2026-11-17
**Масштаб:** 476 файлов в `src/`, 94 API-роута, 177 тестовых файлов
**Метод:** 5 параллельных аудитов (качество кода, подсистема агентов, фронтенд/UX, API/бэкенд, сверка «обещанного» с кодом) + `tsc --noEmit` (проходит чисто).

---

## Итог одной строкой

Кодовая база написана с высокой культурой (Zod-валидация, криптостойкие коды, SSRF-гварды, чистая типизация, понятные комментарии), но страдает от **монолитов и дублирования**, **неравномерной обработки ошибок** и **незакрытых гонок в подсистеме агентов**. Функционально реализовано многое, но часть фич доведена частично, а три крупных модуля (грейдббук, долгосрочные планы, импорт .docx) не достижимы из навигации.

---

# 1. Плохо реализовано по коду

## 1.1. Критично

### Монолиты и гигантские файлы (>500 строк: 24 файла)
| Файл | Строк | Комментарий |
|---|---|---|
| `src/lib/i18n/dictionaries.ts` | 1877 | сырые данные переводов + логика `fill()` в одном файле |
| `src/components/ksp/plan-form.tsx` | 1748 | ~20 ответственностей: редактирование, AI-генерация, конфликты версий, diff, автосохранение, табы, проверка оценок |
| `src/lib/handouts/docx.ts` | 1305 | |
| `src/lib/handouts/generate.ts` | 1148 | |
| `src/components/ksp/task-builder.tsx` | 1068 | |
| `src/components/workspace/apps/browser.tsx` | 1042 | один компонент, 30+ ref/state, зеркала состояния |
| `src/components/ksp/handout-preview.tsx` | 1039 | |
| `src/lib/export/html.ts` | 958 | |
| `src/lib/agents/computer/loop.ts` | 863 | вложенные `loop()` + `performAction` + `run` из замыканий |
| `src/components/ksp/textbooks-manager.tsx` | 846 | |
| `src/components/ksp/task-player.tsx` | 769 | |
| `src/lib/assignments.ts` | 752 | |
| `src/components/workspace/apps/computer-use.tsx` | 740 | |
| `src/lib/import/docx.ts` | 688 | |
| `src/lib/export/pptx.ts` | 672 | |
| `src/lib/agents/runner.ts` | 648 | |
| `src/lib/ai/image.ts` | 613 | |
| `src/lib/export/docx.ts` | 587 | |
| `src/lib/ai/tasks.ts` | 575 | |
| `src/components/ksp/live-quiz-host.tsx` | 539 | |
| `src/lib/agents/sandbox-runner-code.ts` | 531 | весь раннер — строка-шаблон `RUNNER_SCRIPT` |
| `src/lib/agents/tools/browser.ts` | 530 | |
| `src/lib/rag/armanpv.ts` | 502 | |

### Дублирование кода
- **Преамбула API-роутов** (проверка MongoDB + rate-limit + auth + поиск плана) скопирована в 23+ файла: `src/app/api/export/docx/[id]/route.ts:19-42`, `src/app/api/export/pptx/[id]/route.ts:18-40`, `src/app/api/export/zip/[id]/route.ts:19-42`, `src/app/api/ai/generate/route.ts:46-68`, `src/app/api/ai/enhance/route.ts:38-60`. → Нужен общий хелпер `withAuthRateLimit()`.
- `listPending()` продублирован: `src/lib/agents/permissions.ts:132-143` и `src/lib/agents/computer/confirm.ts:45-53`.
- 4 почти идентичные страницы школы (~200 строк каждая, по 6–7 отдельных `useState`): `src/app/school/characteristics/page.tsx`, `src/app/school/homeroom/page.tsx`, `src/app/school/iom/page.tsx`, `src/app/school/sor-soch/page.tsx`.
- Идентичный fallback генерации id: `src/components/ksp/task-builder.tsx:145` и `src/components/ksp/stage-editor.tsx:39`.
- Идентичный маппинг учеников: `src/app/school/attendance/page.tsx:45` и `src/app/school/quality/page.tsx:33`.

### Проглоченные ошибки
- **18 пустых `catch {}`** без единого лога:
  - `src/lib/agents/browser-dom.ts:46,67,85,94,122,187` — 6 пустых catch в одном файле;
  - `src/app/api/ai/generate/stream/route.ts:245` — сбой `logAiHistory` теряется, история ИИ не пишется;
  - `src/lib/agents/sandbox-runner-code.ts:15,204,219` — включая чтение конфига раннера;
  - `src/lib/agents/sandbox-browser-service.ts:171,240,244`, `src/lib/workspace/runtime.ts:119`, `src/components/ksp/hooks/use-plan-ai.ts:312`, `src/components/ksp/voice-input.tsx:54,61`.
- `src/app/api/agents/control/route.ts:26-27,52` — `.catch(() => {})` в конкурентной логике управления сессией → рассинхрон панели.

### Экспорт без обработки ошибок
- `src/app/api/export/docx/[id]/route.ts:37` и `src/app/api/export/zip/[id]/route.ts:49` — `buildKspDocx`/`zip.generateAsync` без try/catch → HTML-500 со стектрейсом вместо JSON. `pptx`-роут уже исправлен (`src/app/api/export/pptx/[id]/route.ts:34-55`) — docx/zip/teacher-script отстали.
- `src/app/api/ai/history/route.ts` — нет try/catch вообще. То же: gradebook/export, plans/search, plans/[id]/like, quiz/[code]/results, lessons, textbooks.

### Безопасность (статически видимое)
- **Секрет в исходнике:** `src/lib/auth.ts:14` — `DEV_SECRET = "ksp-app-development-secret-only"`. Смягчено throw в production (`auth.ts:45-48`), но fallback на известную строку виснет на флаге NODE_ENV.
- **Обход типов:** 28 кастов `as unknown as`, десятки не-нулевых утверждений `!`:
  - `src/app/api/quiz/[code]/route.ts:312` — секретная часть задания кастуется к `InteractiveTask` **без runtime-валидации** (публичная часть проходит zod, секретная — нет) → краш на клиенте при расхождении;
  - `src/app/actions/plans.ts:205` — восстановление плана из корзины без повторной валидации схемы;
  - `src/lib/school.ts:166,172` — `query.status ... as unknown as StudentDoc['status']`;
  - `src/lib/ai/providers.ts:356` — двойной каст `as never` для подмены метода SDK (хрупко при обновлении OpenAI SDK).
- `src/lib/agents/sandbox-runner-code.ts:434` — `new Function("arg", \`const __mektyScript = (${script}); ...\`)`: произвольная строка исполняется как код. Смягчено только ограничениями (длина, обязательный префикс `(`). Классический eval-подобный синк (в контексте страницы Chromium).
- `src/app/api/agents/terminal/route.ts:34` — `echo $$ > /tmp/mekty-term.pid; exec ${body.command}`: пользовательский ввод интерполируется в bash без экранирования. Компенсируется auth + песочницей, но это осознанный риск исполнения произвольных команд.

## 1.2. Существенно

### Авторизация
- **Нет middleware/центрального слоя auth.** Комментарий в `src/lib/auth.ts:31` ссылается на «proxy.ts», но файла нет. Защита только пер-роутная (75/98 роутов через `requireApiAuth`, ещё 17 через `getCurrentUser`). Новый роут без проверки молча становится публичным. → Нужен middleware или lint-правило, требующее `requireApiAuth`.

### Rate limiting
- Из 17 роутов школы лимит есть только в 2 (`src/app/api/school/**`).
- `GET /api/assignments/code/{code}` — публичный GET без лимита (`src/app/api/assignments/code/[code]/route.ts:18`) при 6-значном коде (10⁶ вариантов) → перебор открывает все выдачи.
- **Общие bucket:**
  - `ai:${auth.user.id}` (30/час) общий для возвратов и генераций: `src/app/api/ai/refund/route.ts:16`, `src/app/api/ai/generate/route.ts:36`;
  - `export:${user?.id || clientIp(request)}` (30/мин) общий на все 4 типа экспорта: `src/app/api/export/docx/[id]/route.ts:22`.
- `src/app/api/agents/browser-stream/route.ts:61` — 240/мин общий на все действия: поллинг кадра (1.2 с) + keepalive + инструменты агента легко упираются в лимит → клиент ставит ретрай.

### Валидация и ответы
- **Нет глобального лимита размера тела.** `next.config.ts` не задаёт body-лимитов; JSON читается целиком в память. Ограничения есть только в `import/docx` (10 МБ) и `textbooks/upload` (50 МБ). Пример: `ai/chat` принимает `planContext.content: z.unknown()` без верхней границы (`src/app/api/ai/chat/stream/route.ts:17`).
- `src/app/api/objectives/route.ts:115-118` — ошибка в теле ответа с HTTP 200: `{ objectives: [], error: "subject (name) is required without MongoDB" }, { status: 200 }`.
- Смешение языков и кодов ошибок: русские/английские сообщения вперемешку; один и тот же сценарий внешней ошибки отдаёт 500 (`enhance`), 502 (`pptx`), 503 (`generate`). Клиент вынужден string-match'ить сообщения (`message.startsWith('Access denied')`, `message.includes('not found')`).

### MongoDB
- `src/app/api/school/[id]/grades/route.ts:66` — сохранение оценки тянет **весь класс** (`getSchoolStudents` + `.find()` по массиву) вместо `findOne({_id})`. O(размер класса) на каждый вызов.
- `src/lib/workspace/runtime.ts:299,278-289` — rollback-снимки копятся бесконечно: `restoreSnapshot` добавляет документ при каждом восстановлении, чистка исключает `rollback-*`.
- `src/lib/agents/browser-session.ts:178-185` — `reapSessions` не закрывает `opening`-промисы: созревающая сессия может быть закрыта, `createRemoteSession` вернёт закрытый контекст.

### Биллинг
- `src/lib/billing/redeem.ts:57-90` — **redeem завязан на транзакции replica set.** `session.withTransaction` требует replica set/Atlas: на standalone MongoDB (локальный mongod, бесплатный Atlas M0) любая активация молча падает в catch → 503 «Активация временно недоступна». Fallback отсутствует.
- `src/app/api/ai/refund/route.ts` — **TOCTOU-гонка:** `countDocuments(refundsUsed >= 3)` → `findOne` → `deleteOne` без транзакции: два параллельных POST могут оба пройти лимит и удалить один слот.

## 1.3. Низкое/стилистика

- `eslint-disable` как тренд: `react-hooks/set-state-in-effect` подавлен 3 раза (`app-shell.tsx:156`, `deck-builder.tsx:173`, `live-quiz-host.tsx:65`); `react-hooks/exhaustive-deps` — 5 раз (`plan-form.tsx:233`, `group-work.tsx:44`, `live-quiz-host.tsx:220`, `task-player.tsx:75`).
- Магические константы: `?: 30` (лимит времени) в `src/app/api/quiz/[code]/route.ts:236`, `5000`, `10000`, `30/60_000` — без именованных констант.
- `src/app/longterm/[id]/medium/new/page.tsx:71` — `href="javascript:history.back()"` (не сработает при CSP/без JS).
- `src/components/workspace/workspace.tsx:37-40` — неизвестный тип окна молча `null`.
- 16 `any` по базе, все оправданы (Web Speech API), с eslint-disable: `src/components/ksp/voice-input.tsx:84,101`.

---

# 2. Плохо реализовано по функционалу

## 2.1. Подсистема агентов (самое слабое место)

### Жизненный цикл задач
1. **[High] Остановка не отменяет задачи в очереди.** `src/app/api/agents/task/[id]/stop/route.ts:22-24` возвращает `{ok:true, status:'queued'}` и **не меняет статус**; диспетчер `orchestrator.ts:31-90` позже запустит задачу — пользователь «остановил», а она выполнится.
2. **[High] Зомби-перезапись статуса.** `src/lib/agents/runner.ts:575-578`: диспетчер пометил `failed` (раннер «умер» по стейлу), старый раннер доработал и перезаписал `failed` → `completed`. Пользователь видит «готово» по реально прерванной задаче.
3. **[High] Двойной запуск одной задачи.** `src/lib/agents/orchestrator.ts:265-297,349-390`: `continueAgentTask` (HMAC) и «Передать управление ИИ» могут одновременно пройти и дважды вызвать `runAgentTask` — оба раннера выполняют инструменты параллельно. `runAgentTask` не пере-клеймит задачу.

### Терминал
4. **[High] Гонка PID-файла.** `src/app/api/agents/terminal/route.ts:34` + `terminal/stop/route.ts:15`: каждая команда пишет `echo $$ > /tmp/mekty-term.pid; exec <cmd>` в один общий файл. Две вкладки перезаписывают файл; «Стоп» убьёт только последнюю команду; `kill $(cat pid)` может убить переиспользованный PID.

### SSE-поток задачи
5. **[High] Утечка поллинга при обрыве.** `src/app/api/agents/task/[id]/route.ts:65-74,158-163`: интервал (700 мс) очищается только в `abort`-обработчике; при обрыве без abort-события (proxy/serverless) цикл продолжает читать Mongo. Нет keepalive-байтов — иденти-прокси могут рвать соединение.
6. **[Medium] Потеря логов при совпадении миллисекунд.** Фильтр `created_at > lastCreatedAt` не доставляет документ с тем же timestamp; `seen`-Set растёт бесконечно.

### Браузерная сессия / SSRF
7. **[High] Гонка clear/persist.** `src/lib/agents/browser-session.ts:253-313,465` + `browser-stream/route.ts:133-140`: незавершённый `createAgentBrowserSession` после `clearAgentBrowserSession` снова положит сессию в Map, а фоновый persist допишет состояние после удаления документа — «разлогинивание» откатывается, старые куки возвращаются.
8. **[Medium] `installRequestGuard` — no-op на удалённой сессии.** `src/lib/agents/browser-session.ts:407,422`: `page.route/unroute` в заглушке возвращают `undefined` — вызовы из `computer/route.ts:102,126` и `tools/browser.ts:298` ничего не защищают. Весь SSRF-контур держится на гуарде внутри раннера.
9. **[Medium] DNS TOCTOU.** `src/lib/agents/sandbox-runner-code.ts:147-176,368`: разрешение кэшируется на 30 с (`dnsCache`); между `checkPublicUrl` и `page.goto` хост может перебиндиться на внутренний адрес.
10. **[Medium] `allowedOrigin` — мёртвый параметр** (`browser-stream/route.ts:174`): в раннере не читается.
11. **[Medium] Недостижимая ветка «local Playwright»** (`browser-stream/route.ts:244-304`): `getAgentBrowserSession` бросает 503 при `browserTarget !== "vercel-sandbox"` — локальная ветка никогда не выполняется, но поддерживается параллельно.
12. **[Medium] Инъекция селектора + мёртвый код:** `src/lib/agents/browser-autologin.ts:289-291` — `document.querySelector("${site.submitSelector...}")`, при этом `tryAutoLogin` не вызывается нигде в src.
13. **[Low] Replay-окно HMAC ±120 с** (`sandbox-runner-code.ts:225-235`) — подписанный запрос можно воспроизвести в течение 2 минут.
14. **[Low] Установка зависимостей из внешних источников внутри песочницы** (`sandbox-browser-service.ts:108-158`): `npm i playwright@1.64.1` + `npx playwright install chromium` + `curl` шрифтов без пиннинга по хэшу — дрейф версий, поверхность для атак на поставку.
15. **[Low] Слот `beginRun` не атомарный** (`src/lib/agents/computer/run-state.ts:41-51`): `findOne` → `updateOne` — два одновременных старта могут оба пройти.
16. **[Low] Владелец управления остаётся `"ai"` после завершения** (`computer/route.ts:84,148-150`): `releaseControlToUser` не вызывается в finally.

### Ввод/дублирование
17. **[Medium] Действия неидемпотентны** (type/navigate/click без ключей): при таймауте транспорта действие могло выполниться, клиент повторит — дубль ввода. `withBrowserSession` ретраит только 410.
18. **[Medium] `browser.tsx` абортит предыдущий скриншот при каждом тике поллинга 1.2 с** (`src/components/workspace/apps/browser.tsx:241-267`): если серверная генерация кадра идёт, работа дублируется + нагрузка на песочницу.
19. **[Low] Backspace при рассинхроне буфера** (`browser.tsx:468-491`): удаляется «лишний» символ.
20. **[Low] `typeTimerRef` не очищается при unmount** (`browser.tsx`) — в отличие от `frameSyncTimerRef`/`wheelTimerRef`.
21. **[Low] Watchdog-`setInterval(1200)` в раннере** (`src/lib/agents/runner.ts:142-149`) останавливается только в `finally`; при `process.exit` держит процесс.

## 2.2. Фронтенд/UX

### Live-квиз
1. **[High] Fire-and-forget POST без `.catch()`:** `void postQuizEvent(...)` — `src/components/ksp/live-quiz-host.tsx:74,182,190,196`, `live-quiz-student.tsx:123,130`. При сбое сети ответ ученика, join, reveal молча теряются: ученик видит «Отправлено», хост — ничего. Повтора нет.
2. **[Medium] Авто-reveal с подавленным exhaustive-deps** (`live-quiz-host.tsx:216-221`): при быстрой смене вопроса возможен stale `currentIndex`/`tasks`.

### Гидрация
3. **[High] `Math.random()` в `useMemo`:** `src/components/ksp/task-player.tsx:54-64` — `shuffleIndices()` на рендере; клиентские компоненты рендерятся и на сервере (SSR-страница `/plans/[id]`, quiz-mode, task-builder) → разный порядок вариантов на сервере/клиенте. Тот же класс бага уже исправлялся (`window.tsx:20-25`, `time-ago.tsx`).
4. **[Medium] `useState(() => Date.now())`:** `src/components/agents/use-task-status.ts:42` — разное время на сервере/клиенте → расхождение `elapsed` при гидрации.

### Потеря данных
5. **[High] Редакторы longterm/mediumterm без защиты:** `src/app/longterm/new/page.tsx`, `src/app/longterm/[id]/medium/new/page.tsx` — только useState, нет `beforeunload`, нет черновика. Уход со страницы безвозвратно теряет весь контент. (Защита есть только в `plan-form.tsx:230-244`.)

### UX-обратная связь
6. **[Medium] Посещаемость:** `src/components/school/attendance-recorder.tsx:41` — неотмеченные ученики получают `present` по умолчанию: открыл форму и нажал «Сохранить» = явка всему классу.
7. **[Medium] Файл-менеджер:** `src/components/workspace/apps/file-manager.tsx:157-170` — ошибка fetch подставляется как содержимое файла («Не удалось прочитать файл»), визуально неотличима от реального файла.
8. **[Medium] Архив ученика без подтверждения:** `src/components/school/students-client.tsx:92-106`; восстановление есть, но предупреждения нет.
9. **[Low] «Закрыть» выдачу без подтверждения:** `src/components/assignments/assignment-actions.tsx:51-55`.
10. **[Medium] Polling без AbortController/таймаутов:** `live-quiz-host.tsx:116`, `live-quiz-student.tsx:105`, `computer-use.tsx:188,220`, `school-workspace.tsx:116` — при зависшем сервере висящие fetch копятся.
11. **[Medium] UndsetTimeout` без cleanup:** `browser.tsx:804` — после unmount возможен setState.
12. **[Medium] Интервал внутри async-колбэка:** `school-workspace.tsx:147-166` — один лишний тик после unmount.

### Незавершённый UI
13. **[Medium] Тариф школы на публичном pricing:** `src/app/pricing/page.tsx:57` — «Скоро» без CTA.
14. **[Low] Мёртвый тернарник:** `src/components/app/home.tsx:259` — обе ветки дают одинаковый href (`/school?os=browser`).
15. **[Low] Иконки без `aria-label`:** `browser.tsx:686` и др.

## 2.3. Продуктовые дыры

1. **Агенты работают только в Vercel Sandbox.** Вне Vercel вся ветка (браузер, терминал, ОС) деградирует до заглушек «нет Linux-среды» (`src/lib/agents/runtime-mode.ts`).
2. **Комплект урока не дописан** (`docs/lesson-kit-design.md`): нет 3D-меню вопросов перед КСП; нет фоновой параллельной генерации всех слотов при старте (автостарт только при `?kit=start`, панель опрашивает вручную); нет панели согласованности «баллы листа ↔ оценивание».
3. **Осиротевшие фичи:** грейдбук (`/gradebook`) и долгосрочные планы (`/longterm`) реализованы, но не включены в навигацию `src/components/app/app-shell.tsx` / `home.tsx` — достижимы только прямым URL.
4. **Импорт КСП из .docx** (`src/app/import/page.tsx`, `src/app/api/import/docx/route.ts`) реализован, но недостижим из интерфейса.
5. **Мёртвые компоненты:** `src/components/school/school-status-bar.tsx`, `src/components/school/school-topbar.tsx` — не импортируются ниоткуда.
6. **TODO.md устарел:** «Проверка готовности КСП», «История контекста AI», «Матрица полномочий» реализованы, но остаются `[ ]`.
7. **Казахская локализация глубоких форм** — не завершена (TODO.md пометчает `[ ]`). Мобильные ключевые сценарии — частично.
8. **Интеграции:** Supabase не используется (БД — MongoDB); Vercel — единственный runtime агентов; «расписание» BilimClass — только цель агента без гарантий.

---

# 3. Что сделано хорошо (не ломать)

- Zod-валидация почти везде; `z.looseObject` + `.max()` на массивах; `superRefine` для школьных members.
- Атомарная квота (unique partial index `{user_id, task, month, seq}`) и атомарная сдача заданий (`$inc` + `$setOnInsert` + `$expr`).
- Криптостойкие коды активации (`crypto.getRandomValues`/`randomBytes`), хеширование.
- SSRF-гварды, rate-limit в 54 местах, таймауты Mongo (serverSelection 20s / connect 10s / socket 20s) и AI-каскада (фоллбэки провайдеров, `maxRetries: 0`, ручной перебор ключей).
- Индексация покрывает горячие запросы, включая TTL и partial unique.
- `tsc --noEmit` проходит чисто; почти нет `any` (16 по базе, оправданы); нет `@ts-ignore`.
- Дисциплина комментирования: комментарии объясняют «почему».
- N+1 не обнаружен; денежных расчётов в коде нет (только коды и квоты).

---

# 4. Приоритеты исправления

| # | Задача | Зона | Серьёзность |
|---|---|---|---|
| 1 | Атомарный жизненный цикл задач: отмена queued, защита от двойного запуска, запрет `failed`→`completed` | `src/lib/agents/orchestrator.ts`, `runner.ts`, `task/[id]/stop` | Критично |
| 2 | Live-квиз: `.catch` + retry на POST событий, keepalive/abort в polling | `live-quiz-host.tsx`, `live-quiz-student.tsx` | Критично |
| 3 | Экспорт: try/catch везде, лимиты размера, раздельные bucket rate-limit | `src/app/api/export/**` | Высоко |
| 4 | Защита от потери данных в longterm/mediumterm (beforeunload + черновик) | `src/app/longterm/**` | Высоко |
| 5 | Вернуть центральный middleware auth или lint-правило на `requireApiAuth` | `src/lib/auth.ts` | Высоко |
| 6 | Декомпозиция монолитов: `plan-form`, `browser.tsx`, `task-builder`, `computer/loop.ts` | `src/components/ksp/**`, `src/components/workspace/**` | Высоко |
| 7 | Redeem: fallback без транзакций или явная диагностика «нужен replica set» | `src/lib/billing/redeem.ts` | Высоко |
| 8 | Убрать `Math.random`/`Date.now` из рендера (гидрация) | `task-player.tsx`, `use-task-status.ts` | Средне |
| 9 | SSRF: оживить `installRequestGuard` на remote-сессиях, убрать DNS-кэш TOCTOU | `src/lib/agents/browser-session.ts` | Средне |
| 10 | Навигация: добавить грейдбук/longterm/импорт в меню; убрать мёртвые компоненты | `src/components/app/**`, `src/components/school/**` | Средне |
| 11 | Публичный GET по коду выдачи: rate-limit | `src/app/api/assignments/code/[code]/route.ts` | Средне |
| 12 | Единый стандарт ответов API (коды, язык) + глобальный лимит размера тела | `src/app/api/**`, `next.config.ts` | Средне |
| 13 | Обновить TODO.md под фактическое состояние | корень | Низко |
