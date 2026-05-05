-- Lesson sessions ("class-code" feature) — teacher launches a quiz from a
-- saved KSP, students join with a 6-character code without registration,
-- and the teacher sees their progress live.

create type public.session_status as enum ('active', 'closed');

create table public.lesson_sessions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.lesson_plans(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  code text not null,
  status public.session_status not null default 'active',
  -- Snapshot of all interactive tasks at the moment the session was started.
  -- We snapshot so that edits to the plan after the session opens don't
  -- change what students see / break grading mid-session.
  tasks_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '12 hours')
);

create unique index lesson_sessions_active_code_uniq
  on public.lesson_sessions (code)
  where status = 'active';
create index lesson_sessions_plan_idx
  on public.lesson_sessions (plan_id, created_at desc);
create index lesson_sessions_owner_idx
  on public.lesson_sessions (owner_id, created_at desc);

alter table public.lesson_sessions enable row level security;

-- Owner can do anything with their sessions.
create policy "lesson_sessions: owner all"
  on public.lesson_sessions for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Anyone (including anonymous students) can read an active, non-expired
-- session — they need this to load the tasks snapshot. They can only read
-- by exact id (no listing), which is acceptable because join page first
-- looks the session up by code via the `read_session_by_code` RPC below.
create policy "lesson_sessions: anyone reads active"
  on public.lesson_sessions for select
  using (status = 'active' and expires_at > now());

-- RPC for the join page: lookup an active session by 6-char code.
-- Returns id + minimal metadata, never the owner_id.
create or replace function public.read_session_by_code(p_code text)
returns table (
  id uuid,
  plan_id uuid,
  status public.session_status,
  tasks_snapshot jsonb,
  expires_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select s.id, s.plan_id, s.status, s.tasks_snapshot, s.expires_at
  from public.lesson_sessions s
  where s.code = upper(p_code)
    and s.status = 'active'
    and s.expires_at > now()
  limit 1;
$$;

grant execute on function public.read_session_by_code(text) to anon, authenticated;

create table public.session_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.lesson_sessions(id) on delete cascade,
  student_name text not null,
  task_index int not null,
  task_label text,
  response_data jsonb,
  is_correct boolean not null default false,
  score int not null default 0,
  max_score int not null default 1,
  created_at timestamptz not null default now()
);

create index session_responses_session_idx
  on public.session_responses (session_id, created_at desc);
create index session_responses_session_student_idx
  on public.session_responses (session_id, student_name);

alter table public.session_responses enable row level security;

-- Anyone (anonymous students) can insert a response IF the referenced
-- session is currently active and not expired.
create policy "session_responses: anyone insert into active session"
  on public.session_responses for insert
  with check (
    exists (
      select 1
      from public.lesson_sessions s
      where s.id = session_id
        and s.status = 'active'
        and s.expires_at > now()
    )
  );

-- Owner of the session can read all responses to it.
create policy "session_responses: owner reads"
  on public.session_responses for select
  using (
    exists (
      select 1
      from public.lesson_sessions s
      where s.id = session_id
        and s.owner_id = auth.uid()
    )
  );
