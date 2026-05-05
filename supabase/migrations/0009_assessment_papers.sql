-- 0009_assessment_papers.sql — суммативное оценивание (СОР / СОЧ).
--
-- A separate table (vs. shoehorning into lesson_plans) because:
--   * the document is structurally different (no stages, no language objectives,
--     has rubric + grade boundaries + a single duration);
--   * it's listed in a separate dashboard section so a flat enum on
--     lesson_plans would force every existing query to filter by kind;
--   * permissions, slugs, and version history can evolve independently.
--
-- Re-uses the existing plan_visibility and plan_language enums.

create type public.assessment_kind as enum ('sor', 'soch');

create table public.assessment_papers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  kind public.assessment_kind not null,
  title text not null,
  subject_id uuid references public.subjects(id) on delete set null,
  grade int not null,
  quarter int,
  section text,                 -- e.g. "Алгебра. Глава 3" — relevant for sor
  duration_minutes int,          -- e.g. 40
  total_points int,              -- sum of tasks[].points; precomputed for listing
  content jsonb not null default '{}'::jsonb,
  visibility public.plan_visibility not null default 'private',
  language public.plan_language not null default 'ru',
  slug text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.assessment_papers (owner_id, updated_at desc);
create index on public.assessment_papers (visibility, updated_at desc)
  where visibility = 'public';
create unique index assessment_papers_slug_uniq
  on public.assessment_papers (slug)
  where slug is not null;

alter table public.assessment_papers enable row level security;

create policy "assessment_papers: owner sees own"
  on public.assessment_papers for select
  using (auth.uid() = owner_id);

create policy "assessment_papers: public readable by everyone"
  on public.assessment_papers for select
  using (visibility = 'public');

create policy "assessment_papers: unlisted readable with slug"
  on public.assessment_papers for select
  using (visibility = 'unlisted' and slug is not null);

create policy "assessment_papers: owner insert"
  on public.assessment_papers for insert
  with check (auth.uid() = owner_id);

create policy "assessment_papers: owner update"
  on public.assessment_papers for update
  using (auth.uid() = owner_id);

create policy "assessment_papers: owner delete"
  on public.assessment_papers for delete
  using (auth.uid() = owner_id);

-- Touch updated_at on every update so the dashboard can sort by it.
create trigger assessment_papers_touch
  before update on public.assessment_papers
  for each row
  execute function public.touch_updated_at();
