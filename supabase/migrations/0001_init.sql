-- KSP App — initial schema
-- Run this in Supabase SQL Editor (or via `supabase db push` / CLI).

create extension if not exists "pgcrypto";

create type public.plan_visibility as enum ('private', 'unlisted', 'public');
create type public.plan_language as enum ('ru', 'kz');

-- ---------------------------------------------------------------
-- profiles: one row per auth user (Supabase auth.users)
-- ---------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  school text,
  city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own or any profile"
  on public.profiles for select
  using (true);

create policy "profiles: insert self"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles: update self"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Automatically create a profile row when a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------
-- subjects: справочник предметов
-- ---------------------------------------------------------------
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  name_ru text not null,
  name_kz text,
  grade_min int not null default 1,
  grade_max int not null default 11,
  created_at timestamptz not null default now()
);

alter table public.subjects enable row level security;

create policy "subjects: public read"
  on public.subjects for select using (true);

-- ---------------------------------------------------------------
-- learning_objectives: цели обучения из учебной программы РК
-- ---------------------------------------------------------------
create table public.learning_objectives (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  grade int not null,
  code text not null,       -- напр. "5.1.2.1"
  text_ru text not null,
  text_kz text,
  section text,             -- раздел долгосрочного плана
  created_at timestamptz not null default now(),
  unique (subject_id, grade, code)
);

create index on public.learning_objectives (subject_id, grade);

alter table public.learning_objectives enable row level security;

create policy "learning_objectives: public read"
  on public.learning_objectives for select using (true);

-- ---------------------------------------------------------------
-- lesson_plans: сами КСП
-- ---------------------------------------------------------------
create table public.lesson_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  subject_id uuid references public.subjects(id) on delete set null,
  grade int not null,
  quarter int,
  section text,
  content jsonb not null default '{}'::jsonb,
  visibility public.plan_visibility not null default 'private',
  language public.plan_language not null default 'ru',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.lesson_plans (owner_id, updated_at desc);
create index on public.lesson_plans (visibility, updated_at desc)
  where visibility = 'public';

alter table public.lesson_plans enable row level security;

create policy "lesson_plans: owner sees own"
  on public.lesson_plans for select
  using (auth.uid() = owner_id);

create policy "lesson_plans: public plans readable by everyone"
  on public.lesson_plans for select
  using (visibility = 'public');

create policy "lesson_plans: owner insert"
  on public.lesson_plans for insert
  with check (auth.uid() = owner_id);

create policy "lesson_plans: owner update"
  on public.lesson_plans for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "lesson_plans: owner delete"
  on public.lesson_plans for delete
  using (auth.uid() = owner_id);

-- Auto-update updated_at.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger lesson_plans_touch
  before update on public.lesson_plans
  for each row execute procedure public.touch_updated_at();

-- ---------------------------------------------------------------
-- lesson_plan_likes: простая социальная метрика
-- ---------------------------------------------------------------
create table public.lesson_plan_likes (
  plan_id uuid not null references public.lesson_plans(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);

alter table public.lesson_plan_likes enable row level security;

create policy "likes: public read"
  on public.lesson_plan_likes for select using (true);

create policy "likes: self insert"
  on public.lesson_plan_likes for insert
  with check (auth.uid() = user_id);

create policy "likes: self delete"
  on public.lesson_plan_likes for delete
  using (auth.uid() = user_id);
