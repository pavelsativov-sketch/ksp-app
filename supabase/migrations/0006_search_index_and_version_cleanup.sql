-- 0006_search_index_and_version_cleanup.sql
-- PR-6 additions:
--   1. Postgres FTS index on `lesson_plans.content` so search inside
--      topic / objectives / stages doesn't have to scan every row in JS.
--   2. Cap `lesson_plan_versions` at 30 entries per plan so the audit
--      log doesn't grow unbounded under server-side autosave.

-- ─── 1. Search index ────────────────────────────────────────────────────────
-- We extract a flat searchable haystack from the plan content jsonb. This
-- mirrors what `buildPlanSearchText` produces on the client today, but lets
-- Postgres do the matching with a proper inverted index.

create or replace function public.lesson_plan_search_text(c jsonb, t text)
returns text
language plpgsql
immutable
as $$
declare
  parts text[] := array[]::text[];
  stage_key text;
  stage jsonb;
begin
  parts := array_append(parts, coalesce(t, ''));
  parts := array_append(parts, coalesce(c->>'topic', ''));

  -- learningObjectives: array of { code, text }
  if jsonb_typeof(c->'learningObjectives') = 'array' then
    parts := array_append(
      parts,
      coalesce((
        select string_agg(coalesce(o->>'code','') || ' ' || coalesce(o->>'text',''), ' ')
        from jsonb_array_elements(c->'learningObjectives') as o
      ), '')
    );
  end if;

  -- lessonObjectives, assessmentCriteria: arrays of strings
  parts := array_append(parts, coalesce((
    select string_agg(value::text, ' ')
    from jsonb_array_elements_text(c->'lessonObjectives')
  ), ''));
  parts := array_append(parts, coalesce((
    select string_agg(value::text, ' ')
    from jsonb_array_elements_text(c->'assessmentCriteria')
  ), ''));

  -- stages.beginning/middle/end teacherActions/studentActions/resources
  for stage_key in select unnest(array['beginning','middle','end']) loop
    stage := c->'stages'->stage_key;
    if stage is not null then
      parts := array_append(parts, coalesce(stage->>'teacherActions',''));
      parts := array_append(parts, coalesce(stage->>'studentActions',''));
      parts := array_append(parts, coalesce(stage->>'resources',''));
      parts := array_append(parts, coalesce(stage->>'summary',''));
      parts := array_append(parts, coalesce(stage->>'homework',''));
    end if;
  end loop;

  return lower(array_to_string(parts, ' '));
end;
$$;

-- Stored generated column with the haystack.
alter table public.lesson_plans
  add column if not exists search_text text
    generated always as (public.lesson_plan_search_text(content, title)) stored;

-- Inverted GIN index for fast `to_tsvector('russian', search_text) @@ q`.
create index if not exists lesson_plans_search_idx
  on public.lesson_plans
  using gin (to_tsvector('russian', coalesce(search_text, '')));

-- ─── 2. Cap version history per plan ────────────────────────────────────────
-- Trigger fires after each insert into lesson_plan_versions and prunes
-- everything beyond the newest 30 rows for that plan.

create or replace function public.prune_lesson_plan_versions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.lesson_plan_versions v
  where v.plan_id = new.plan_id
    and v.id in (
      select id from public.lesson_plan_versions
      where plan_id = new.plan_id
      order by created_at desc
      offset 30
    );
  return null;
end;
$$;

drop trigger if exists prune_versions_after_insert on public.lesson_plan_versions;
create trigger prune_versions_after_insert
  after insert on public.lesson_plan_versions
  for each row execute procedure public.prune_lesson_plan_versions();
