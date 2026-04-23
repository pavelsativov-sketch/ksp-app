# КСП App

Веб-приложение для учителей Казахстана: конструктор краткосрочных планов урока (КСП) по стандарту обновлённого содержания РК.

**Ключевые фичи:**

- Создание КСП по официальному шаблону РК (цели обучения, языковые цели, ценности, дифференциация, рефлексия и т.д.)
- AI-генерация плана по классу, предмету и теме (OpenAI) с качественным фолбэком без API-ключа
- Библиотека публичных планов от других учителей
- Экспорт в **Word (.docx)** и **PDF** (через печать браузера)
- Многопользовательская БД на **Supabase** с Row-Level Security

## Технологический стек

- **Next.js 16** (App Router, TypeScript, Turbopack)
- **Tailwind CSS 4** + кастомные shadcn-style компоненты
- **Supabase** — Auth + Postgres + RLS
- **OpenAI** (`gpt-4o-mini` по умолчанию) для AI-генерации
- **docx** для экспорта в Word
- **zod** + `react-hook-form` (частично) для валидации

## Быстрый старт

### 1. Установка

```bash
npm install
```

### 2. Создайте Supabase-проект

1. https://supabase.com → New project (бесплатный тариф)
2. Когда проект инициализируется, зайдите в **Project Settings → API** и скопируйте:
   - Project URL
   - `anon` `public` key (legacy JWT)
   - `service_role` key (legacy JWT, секретный)
3. В редакторе SQL (Database → SQL Editor) выполните миграции в порядке:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_seed.sql`

### 3. Переменные окружения

Скопируйте `.env.example` в `.env.local` и заполните:

```bash
cp .env.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Необязательно — без этого AI-генерация работает в режиме заглушки:
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

### 4. Запуск

```bash
npm run dev
```

Приложение откроется на http://localhost:3000.

## Скрипты

| Команда | Что делает |
|---|---|
| `npm run dev` | Dev-сервер с Turbopack |
| `npm run build` | Продакшн-сборка |
| `npm run start` | Запуск продакшн-сборки |
| `npm run lint` | ESLint |

## Структура репозитория

```
src/
  app/
    (public landing, layout, auth)
    dashboard/        — список своих КСП
    plans/
      new/            — визард создания (ручной / AI)
      [id]/           — просмотр
      [id]/edit/      — редактирование
    library/          — публичные КСП
    api/
      ai/generate/    — AI-эндпоинт
      export/docx/[id]/ — экспорт в Word
    actions/          — server actions (auth, plans)
  components/
    ui/               — базовые компоненты (button, input, card, select...)
    ksp/              — бизнес-компоненты (plan-form, plan-view)
  lib/
    supabase/         — клиенты (browser, server, middleware)
    ai/               — промпты и генерация
    export/           — .docx builder
    types/            — типы KSP
    validation/       — zod-схемы
supabase/
  migrations/         — SQL схема + seed
```

## Модель данных

- `profiles` — пользователи (1:1 с `auth.users`)
- `subjects` — справочник предметов
- `learning_objectives` — цели обучения из программы РК (по коду, напр. `5.1.2.1`)
- `lesson_plans` — сами КСП (весь шаблон хранится в `content jsonb`)
- `lesson_plan_likes` — лайки

Все таблицы защищены RLS: учитель видит только свои планы + публичные.

## AI-генерация

Эндпоинт `POST /api/ai/generate` принимает:

```json
{
  "grade": 5,
  "subject": "Математика",
  "topic": "Сложение многозначных чисел",
  "learningObjectives": ["5.1.2.1 — Выполнять сложение натуральных чисел"],
  "language": "ru"
}
```

И возвращает заполненный шаблон КСП (все секции кроме шапки и `learningObjectives`).

Если `OPENAI_API_KEY` не задан — возвращает детерминированную заглушку (для демо и e2e-тестов).

## Экспорт

- **Word (.docx)** — `GET /api/export/docx/:id`, файл с официальным табличным форматом КСП.
- **PDF** — через `window.print()` на странице просмотра: печать в PDF из браузера. Страница имеет `@media print` стили (A4, поля 15мм, таблицы с бордерами).

## Дорожная карта

- [ ] Полный справочник целей обучения РК (импорт CSV)
- [ ] i18n KZ/RU через `next-intl`
- [ ] Совместное редактирование, комментарии коллег
- [ ] Долгосрочный и среднесрочный план (ДСП/ССП)
- [ ] Сбор статистики использования для учителя (кол-во планов, средняя длительность)

## Лицензия

MIT
