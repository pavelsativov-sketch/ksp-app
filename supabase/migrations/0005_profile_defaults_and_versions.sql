-- 0005_profile_defaults_and_versions.sql
-- PR-5 additions:
--   1. Profile defaults: school / teacher_name / preferred_grade columns on
--      `profiles` so the editor can auto-fill the lesson header from a single
--      saved profile instead of forcing the teacher to type the same school /
--      ФИО / класс into every new plan.
--   2. Lesson plan version history: a `lesson_plan_versions` table holding
--      JSON snapshots of `content` + `title` taken on every UPDATE of a
--      lesson_plans row. Owners can browse the timeline and restore an old
--      version. The trigger snapshots only the OLD row so the current row in
--      lesson_plans always represents the latest state.
--
-- All blocks are idempotent (`if not exists` / `do $$ … exists` / `on conflict
-- do nothing`) so this migration can be re-applied safely.

-- ─── 1. Profile defaults ────────────────────────────────────────────────────
-- profiles already has full_name, school, city. Add:
--   - default_grade        (smallint nullable)
--   - preferred_locale     (text — 'ru' | 'kk' for UI localisation, optional)
alter table public.profiles
  add column if not exists default_grade smallint,
  add column if not exists preferred_locale text;

-- ─── 2. Lesson plan version history ─────────────────────────────────────────
create table if not exists public.lesson_plan_versions (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.lesson_plans(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  content     jsonb not null,
  created_at  timestamptz not null default now(),
  -- Optional human label, e.g. "до правки рефлексии 12 марта"
  label       text
);

create index if not exists lesson_plan_versions_plan_idx
  on public.lesson_plan_versions (plan_id, created_at desc);

alter table public.lesson_plan_versions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'lesson_plan_versions'
      and policyname = 'lesson_plan_versions owner select'
  ) then
    create policy "lesson_plan_versions owner select"
      on public.lesson_plan_versions for select
      to authenticated
      using (owner_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'lesson_plan_versions'
      and policyname = 'lesson_plan_versions owner insert'
  ) then
    create policy "lesson_plan_versions owner insert"
      on public.lesson_plan_versions for insert
      to authenticated
      with check (owner_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'lesson_plan_versions'
      and policyname = 'lesson_plan_versions owner delete'
  ) then
    create policy "lesson_plan_versions owner delete"
      on public.lesson_plan_versions for delete
      to authenticated
      using (owner_id = auth.uid());
  end if;
end$$;

-- Snapshot trigger: before each UPDATE on lesson_plans, write the OLD content
-- into lesson_plan_versions. Only fires when content actually changes — no
-- snapshot if we just touched updated_at, visibility, etc.
create or replace function public.snapshot_lesson_plan_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.content is distinct from new.content
     or old.title is distinct from new.title then
    insert into public.lesson_plan_versions (plan_id, owner_id, title, content)
    values (old.id, old.owner_id, old.title, old.content);
  end if;
  return new;
end;
$$;

drop trigger if exists lesson_plans_snapshot_versions on public.lesson_plans;
create trigger lesson_plans_snapshot_versions
  before update on public.lesson_plans
  for each row execute procedure public.snapshot_lesson_plan_version();
