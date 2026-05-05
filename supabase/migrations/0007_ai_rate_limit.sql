-- 0007_ai_rate_limit.sql
-- PR-10: Per-user, per-endpoint rate limiting for AI calls.
--
-- Cloudflare Workers can charge real money on Gemini/OpenAI usage. A single
-- authenticated user can otherwise loop /api/ai/generate-tasks thousands of
-- times an hour and burn the budget. We log every AI call and check the
-- rolling 1-hour window before allowing the next one.
--
-- Idempotent — safe to re-apply.

-- ─── 1. ai_call_log ─────────────────────────────────────────────────────────
create table if not exists public.ai_call_log (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null,
  created_at  timestamptz not null default now()
);

create index if not exists ai_call_log_user_endpoint_created_idx
  on public.ai_call_log (user_id, endpoint, created_at desc);

-- Prune rows older than 7 days on every insert (keeps the table small).
create or replace function public.prune_ai_call_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.ai_call_log
   where created_at < now() - interval '7 days';
  return null;
end;
$$;

drop trigger if exists prune_ai_call_log_trg on public.ai_call_log;
create trigger prune_ai_call_log_trg
  after insert on public.ai_call_log
  for each statement execute procedure public.prune_ai_call_log();

-- RLS: users can only see/insert their own rows; service role bypasses.
alter table public.ai_call_log enable row level security;

drop policy if exists "ai_call_log self read" on public.ai_call_log;
create policy "ai_call_log self read"
  on public.ai_call_log
  for select
  using (auth.uid() = user_id);

drop policy if exists "ai_call_log self insert" on public.ai_call_log;
create policy "ai_call_log self insert"
  on public.ai_call_log
  for insert
  with check (auth.uid() = user_id);

-- ─── 2. check_ai_rate_limit() ──────────────────────────────────────────────
-- Atomic check-and-record:
--   - Counts the user's calls to `endpoint_name` in the last hour
--   - If under `max_per_hour`, inserts a new row and returns true
--   - Otherwise returns false (caller responds 429)
-- Runs as security definer so RLS doesn't get in the way of counting.

create or replace function public.check_ai_rate_limit(
  p_user_id     uuid,
  p_endpoint    text,
  p_max_per_hour int
)
returns table (allowed boolean, used int, max_per_hour int, reset_in_sec int)
language plpgsql
security definer
set search_path = public
as $$
declare
  used_count int;
  oldest_in_window timestamptz;
begin
  select count(*), min(created_at)
    into used_count, oldest_in_window
    from public.ai_call_log
   where user_id = p_user_id
     and endpoint = p_endpoint
     and created_at > now() - interval '1 hour';

  if used_count >= p_max_per_hour then
    return query select
      false                                                      as allowed,
      used_count                                                 as used,
      p_max_per_hour                                             as max_per_hour,
      greatest(
        0,
        extract(epoch from (oldest_in_window + interval '1 hour' - now()))::int
      )                                                          as reset_in_sec;
    return;
  end if;

  insert into public.ai_call_log (user_id, endpoint)
  values (p_user_id, p_endpoint);

  return query select
    true                                                         as allowed,
    used_count + 1                                               as used,
    p_max_per_hour                                               as max_per_hour,
    3600                                                         as reset_in_sec;
end;
$$;

grant execute on function public.check_ai_rate_limit(uuid, text, int)
  to authenticated, service_role;
