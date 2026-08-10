-- 0004_storage_and_series.sql
-- PR-3 additions:
--   1. Public storage bucket "plan-images" for inline images embedded in
--      lesson plan rich-text fields.
--   2. Lesson series (series_id + position) so teachers can chain multiple
--      KSP into a single ordered series and navigate prev/next.

-- ─── 1. Storage bucket ──────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('plan-images', 'plan-images', true)
on conflict (id) do nothing;

-- Public read of plan-images (so .docx and offline html can embed them)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'plan-images public read'
  ) then
    create policy "plan-images public read"
      on storage.objects for select
      using (bucket_id = 'plan-images');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'plan-images authenticated upload'
  ) then
    create policy "plan-images authenticated upload"
      on storage.objects for insert
      to authenticated
      with check (bucket_id = 'plan-images');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'plan-images owner delete'
  ) then
    create policy "plan-images owner delete"
      on storage.objects for delete
      to authenticated
      using (bucket_id = 'plan-images' and owner = auth.uid());
  end if;
end$$;

-- ─── 2. Lesson series ───────────────────────────────────────────────────────
create table if not exists public.lesson_series (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  subject     text,
  grade       smallint,
  quarter     smallint,
  created_at  timestamptz not null default now()
);

alter table public.lesson_plans
  add column if not exists series_id uuid
    references public.lesson_series(id) on delete set null,
  add column if not exists series_position smallint;

create index if not exists lesson_plans_series_idx
  on public.lesson_plans (series_id, series_position);

alter table public.lesson_series enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'lesson_series'
      and policyname = 'lesson_series owner all'
  ) then
    create policy "lesson_series owner all"
      on public.lesson_series for all
      to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end$$;
